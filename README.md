<p align="center">
  <img src="public/icons/resontune.svg" width="72" alt="ResonTune" />
</p>

<h1 align="center">ResonTune</h1>

<p align="center"><strong>Open music. For everyone.</strong></p>

<p align="center">
A free, open-source, community-driven music platform.<br/>
Discover → organize → play → visualize → share — no subscriptions, no artificial listening limits, no account required to listen.
</p>

---

## What ResonTune is

ResonTune combines three worlds into one player:

1. **Community catalog** — artists, releases, tracks, lyrics, credits and
   *visible licensing*, submitted by the community and approved through
   moderation.
2. **Local music** — drag audio files into the browser; they're parsed
   (tags + embedded artwork), stored in IndexedDB, and **never uploaded**.
   Local and remote tracks are clearly distinguished everywhere.
3. **External discovery** — a provider architecture (`src/providers/`)
   designed for official APIs/embeds only. When direct playback isn't
   permitted, tracks fall back to embeds, external playback or
   metadata-only. No DRM bypass, no scraping, no proxying protected streams.

The player is persistent across navigation, has compact / expanded /
immersive modes, media-key support (Media Session API), queue + position
persistence, and a real Web-Audio-powered visualizer engine with eight modes.

### What ResonTune is not

- Not a piracy tool. Provider adapters must respect terms of service.
- Not a social network. Community features stay lightweight (likes, public
  playlists, community picks).
- Not a subscription business. There are no premium walls to build.

## Quick start

```bash
git clone https://github.com/flessan/resontune
cd resontune
npm install

# 1. Render the demo catalog's audio (original, procedurally composed, CC0)
npm run seed:audio

# 2. Start the API (embedded PGlite Postgres — zero external services)
npm run dev:server

# 3. In another terminal, start the web app
npm run dev
```

Open http://localhost:5173. The database migrates and seeds itself on first
boot. Sign in with any handle (dev sign-in) — the **first account becomes
admin** so you can try the moderation queue.

> The demo audio is generated locally by `scripts/generate-audio.cjs`:
> seventeen original instrumental pieces composed procedurally (chords, bass,
> arps, leads, percussion) and dedicated to the public domain (CC0). The demo
> artists are fictional. This keeps the repository livable, licensing-clean
> and honest — no fake `<audio>` tags pointing at nothing, no third-party
> copyrighted files.

### Production (Neon Postgres + GitHub OAuth)

```bash
cp .env.example .env       # fill in DATABASE_URL, GITHUB_CLIENT_ID, …
npm run build              # builds the client into dist/
npm start                  # serves API + client on $PORT
```

With `DATABASE_URL` set, the same schema runs on Neon Postgres. With GitHub
OAuth configured, dev sign-in disables itself automatically.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Domain boundaries, data flow, player/visualizer design |
| [docs/database.md](docs/database.md) | Schema, relations, storage migration path |
| [docs/providers.md](docs/providers.md) | Provider adapters and their rules |
| [docs/visualizers.md](docs/visualizers.md) | Writing a visualizer mode |
| [docs/moderation.md](docs/moderation.md) | Submission workflow and moderation states |
| [docs/deployment.md](docs/deployment.md) | Deployment, env vars, security posture |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Reporting vulnerabilities |

## Principles

1. Listening comes first.
2. No account required for basic listening.
3. Local music is a first-class citizen.
4. Community creators are first-class citizens.
5. Respect licensing and provider rules — visibly.
6. No artificial premium walls.
7. No lock-in: JSON + M3U export are built in.
8. The player is a product, not a footer widget.
9. The visualizer is part of ResonTune's identity.
10. Real functionality over impressive mockups.

## Stack

React 19 · TypeScript · Vite · zustand · Express · Neon Postgres
(PGlite embedded in dev) · IndexedDB (idb) · Web Audio API ·
Media Session API · PWA. No CSS framework — the visual system is
hand-built (`src/styles/global.css`).

## License

[MIT](LICENSE). Seed audio: CC0. Music submitted by the community remains the
property of its rights holders — see track pages for per-track licensing.
