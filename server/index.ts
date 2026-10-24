/**
 * ResonTune API server.
 *
 * Serves /api/* (JSON) and /media/* (hosted audio with HTTP Range support).
 * In production it also serves the built client from dist/.
 *
 * Abuse resistance built in:
 *  - bounded JSON bodies
 *  - per-IP rate limits (general + stricter for writes)
 *  - server-side validation on every mutation (zod)
 *  - pagination bounds on every list endpoint
 *  - cache headers on public catalog reads
 *  - no credentials ever sent to the client
 */
import './env.ts'; // must run before any module reads process.env
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db/index.ts';
import { attachUser, authRouter } from './auth.ts';
import { catalogRouter } from './routes/catalog.ts';
import { playlistsRouter } from './routes/playlists.ts';
import { meRouter } from './routes/me.ts';
import { moderationRouter } from './routes/moderation.ts';
import { ACCOUNT_GONE_MESSAGE, HttpError, isDeletedAccountViolation } from './util/http.ts';
import { playRouter } from './routes/play.ts';
import { siteRouter } from './routes/site.ts';
import { usersRouter } from './routes/users.ts';
import { adminRouter } from './routes/admin/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 8787);

/**
 * Build the fully wired Express app (routes, limits, auth, static, errors).
 * Exported so tests can exercise the real server instead of a copy of its
 * wiring; `main()` below is the only place that listens on a port.
 */
export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Cloudflare/reverse proxy in production

  app.use(express.json({ limit: '64kb' })); // bounded payloads

  /* ------------------------------ rate limits ----------------------------- */

  const generalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  });
  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many changes at once. Please slow down.' },
  });
  app.use('/api', generalLimiter);
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return writeLimiter(req, res, next);
    next();
  });
  /* --------------------------------- auth --------------------------------- */

  app.use('/api', attachUser);
  app.use('/api/auth', authRouter());

  /* --------------------------- cache-aware reads --------------------------- */

  app.use('/api', (req, res, next) => {
    const privatePath =
      req.path.startsWith('/auth') || req.path.startsWith('/me') || req.path.startsWith('/admin') ||
      req.path.startsWith('/moderation');
    if (req.method === 'GET' && !privatePath) {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  /* -------------------------------- routes -------------------------------- */

  app.use('/api', catalogRouter());
  app.use('/api/play', playRouter());
  app.use('/api/site', siteRouter());
  app.use('/api/playlists', playlistsRouter());
  app.use('/api/me', meRouter());
  app.use('/api/users', usersRouter());
  app.use('/api/admin', adminRouter());
  app.use('/api/moderation', moderationRouter());

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'resontune' }));

  /* ------------------------------- media ---------------------------------- */
  // Hosted catalog audio (object-key sources) served with Range support so
  // seeking works. Real deployments point AUDIO_CDN_BASE at object storage
  // or a CDN instead of keeping files on the app server.

  const mediaDir = path.resolve(__dirname, '../media/audio');
  app.get('/media/audio/:file', (req, res) => {
    const file = String(req.params.file);
    if (!/^[a-z0-9-]+\.mp3$/.test(file)) return void res.status(400).end();
    const full = path.join(mediaDir, file);
    if (!full.startsWith(mediaDir) || !fs.existsSync(full)) return void res.status(404).end();
    const stat = fs.statSync(full);
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', end - start + 1);
          return void fs.createReadStream(full, { start, end }).pipe(res);
        }
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
        return void res.end();
      }
    }
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(full).pipe(res);
  });

  /* --------------------------- static (production) ------------------------- */

  const dist = path.resolve(__dirname, '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|media).*/, (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  /* ------------------------------ error handling --------------------------- */

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // A write that lost a race with account deletion reaches the database as
    // a foreign-key violation against users. That is not a server fault and
    // must not read like one: it is the account being gone, in one place, in
    // one wording, for every router.
    if (isDeletedAccountViolation(err)) {
      return void res.status(401).json({ error: ACCOUNT_GONE_MESSAGE });
    }
    const status = err instanceof HttpError ? err.status : Number(err?.status ?? err?.statusCode) || 500;
    if (status >= 500) console.error('[api]', err);
    // Only deliberate HttpErrors describe themselves to the client; anything
    // else could carry a driver/stack detail, so it stays generic.
    const message = err instanceof HttpError || status < 500 ? err.message : 'Something went wrong.';
    res.status(status).json({ error: message ?? 'Server error.' });
  });

  return app;
}

async function main() {
  await migrate();
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[resontune] API listening on http://0.0.0.0:${PORT}`);
  });
}

/* Started directly (`npm start` / `tsx server/index.ts`), not when a test
   imports createApp(). */
const startedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (startedDirectly) {
  main().catch((err) => {
    console.error('Failed to start ResonTune server:', err);
    process.exit(1);
  });
}
