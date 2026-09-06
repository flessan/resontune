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

A streaming platform built on five pillars — *Listen · Discover · Create ·
Release · Share*:

1. **ResonTune Originals** — the platform's own catalog: artists who release
   directly through ResonTune, hosted by the platform, free to stream, with
   clear licensing on every track. Marked everywhere with the
   `RESONTUNE ORIGINAL` wordmark.
2. **Community catalog** — independent artists publish through a real
   pipeline: submission → review → approval → publication, with declared
   rights recorded verbatim and full moderation history.
3. **Radio** — continuous listening: ResonTune Radio, Originals Radio,
   Community Radio, plus genre/artist/track stations. Deterministic seeded
   queues, no recommender system, no profiling.
4. **Local music** — drag audio files into the browser; they're parsed
   (tags + embedded artwork), stored in IndexedDB, and **never uploaded**.
   Local files are a separate, private world, labeled `Local` everywhere.
5. **Discovery & editorial** — genres, moods, collections (curated mixes of
   tracks, releases and artists), community picks. Explained, deterministic
   sections — never a black-box feed.

Every playable track has an **inspectable origin** (Original / Community /
External / Local) and an explicit rights record. The player asks the server
how a track may be played (`/api/play/:id`) — takedowns and permissions are
enforced in one place, and provider adapters only ever use official
mechanisms. No DRM bypass, no scraping, no proxying protected streams.

The player is persistent across navigation, has compact / expanded /
immersive modes, media-key support (Media Session API), queue + position
persistence, and a real Web-Audio-powered visualizer engine with eight modes.
The visualizer is on by default: pressing play lights up a subtle **Minimal
Spectrum** right in the compact player bar, the expanded player adds a larger
spectrum with quick mode/sensitivity controls, and the immersive view is the
full experience. Every mode renders from live audio analysis — silence looks
like silence.

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
boot. Sign in with any handle (dev sign-in) — on a fresh **development**
database the first account becomes admin so you can try the moderation
queue. In production, roles come only from `ADMIN_USER_IDS` /
`MODERATOR_USER_IDS` (see `.env.example`).

> **About the launch catalog.** The "ResonTune Originals — Founding Catalog"
> (five artists, seven releases) and the two community-side artists are
> fictional label identities created for launch; they do not represent real
> people. All twenty-two tracks are original instrumental music composed
> procedurally by `scripts/generate-audio.cjs` (chords, bass, arps, leads,
> percussion) and dedicated to the public domain (CC0) — so the platform
> genuinely holds the rights it claims. This keeps the repository livable,
> licensing-clean and honest: no fake `<audio>` tags pointing at nothing, no
> third-party copyrighted files.

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
| [docs/database.md](docs/database.md) | Schema, migrations, relations, storage migration path |
| [docs/catalog-model.md](docs/catalog-model.md) | Provenance, rights model, content states, collections, roles |
| [docs/radio.md](docs/radio.md) | Radio stations and deterministic selection |
| [docs/providers.md](docs/providers.md) | Provider adapters and their rules |
| [docs/visualizers.md](docs/visualizers.md) | Writing a visualizer mode |
| [docs/moderation.md](docs/moderation.md) | Submission workflow and moderation states |
| [docs/deployment.md](docs/deployment.md) | Deployment, env vars, security posture |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Reporting vulnerabilities |

## Contributing & support

There's a contribution path for everyone — musicians (submit through the
in-app community program), listeners (metadata and rights reports,
translations, docs), and developers (fork → branch → change → PR; see
[CONTRIBUTING.md](CONTRIBUTING.md)). The in-app **Contribute** page
summarizes all of them.

ResonTune has no subscriptions or ads; infrastructure is community-supported.
The in-app **Support** page lists the active methods (GitHub Sponsors,
Sociabuzz, QRIS). All of them are external links — ResonTune never collects
payment credentials. Instance operators configure the links via
`GITHUB_SPONSORS_URL` / `SOCIABUZZ_URL` / `QRIS_IMAGE_URL` (see
`.env.example`) or live from the admin section of the Settings page — no
rebuild needed.

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

[MIT](LICENSE). Launch-catalog audio: CC0. Music submitted by the community
remains the property of its rights holders — see track pages for per-track
licensing.
