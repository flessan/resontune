<p align="center">
  <img src="public/icons/resontune.svg" width="72" alt="ResonTune" />
</p>

<h1 align="center">ResonTune</h1>

<p align="center"><strong>Open music. For everyone.</strong></p>

<p align="center">
A free, open-source, community-driven music platform.<br/>
Discover → organize → play → visualize → share - no subscriptions, no artificial listening limits, no account required to listen.
</p>

---

## What ResonTune is

A streaming platform built on five pillars - *Listen · Discover · Create ·
Release · Share*:

1. **ResonTune Originals** - the platform's own catalog: artists who release
   directly through ResonTune, hosted by the platform, free to stream, with
   clear licensing on every track. Marked everywhere with the
   `RESONTUNE ORIGINAL` wordmark.
2. **Community catalog** - independent artists release through the
   community: reach the team on the community channels (Discord / Telegram /
   WhatsApp), talk rights and licensing, and approved music is published
   with the declared rights recorded verbatim.
3. **Radio** - continuous listening: ResonTune Radio, Originals Radio,
   Community Radio, plus genre/artist/track stations. Deterministic seeded
   queues, no recommender system, no profiling.
4. **Local music** - drag audio files into the browser; they're parsed
   (tags + embedded artwork), stored in IndexedDB, and **never uploaded**.
   Local files are a separate, private world, labeled `Local` everywhere.
5. **Discovery & editorial** - genres, moods, collections (curated mixes of
   tracks, releases and artists), community picks. Explained, deterministic
   sections - never a black-box feed.

Every playable track has an **inspectable origin** (Original / Community /
External / Local) and an explicit rights record. The player asks the server
how a track may be played (`/api/play/:id`) - takedowns and permissions are
enforced in one place, and provider adapters only ever use official
mechanisms. No DRM bypass, no scraping, no proxying protected streams.

The player is persistent across navigation, has compact / expanded /
immersive modes, media-key support (Media Session API), queue + position
persistence, and a real Web-Audio-powered visualizer engine with eight modes.
**Flow** (`/game`) is a built-in horizontal rhythm game: play the Preview Beat
or chart any local file. Timing is locked to a dedicated audio clock; music
never leaves the device.
The visualizer is on by default: pressing play lights up a subtle **Minimal
Spectrum** right in the compact player bar, the expanded player adds a larger
spectrum with quick mode/sensitivity controls, and the immersive view is the
full experience. Every mode renders from live audio analysis - silence looks
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

# 1. Start the API (embedded PGlite Postgres - zero external services)
npm run dev:server

# 2. In another terminal, start the web app
npm run dev
```

Open http://localhost:5173. The database migrates itself on first boot and
**starts empty** - ResonTune is comfortable with an empty catalog; every
surface has an honest empty state, and local music playback works
immediately. The catalog grows as real music is published.

**Authentication is Neon Auth.** Set `NEON_AUTH_URL` (server) and
`VITE_NEON_AUTH_URL` (client) to your Neon Auth base URL to enable sign-in;
without them the app runs fully anonymous (browsing, playback and local
music never require an account). Identity providers like GitHub are
configured inside Neon Auth, not in this codebase. Roles come only from
`ADMIN_USER_IDS` / `MODERATOR_USER_IDS` (see `.env.example`).

**Profile photos are optional.** Set `IMGBB_API_KEY` (server-side only) to
let members upload an avatar - the browser sends the image to ResonTune,
ResonTune forwards it to ImgBB and stores just the URL. Without the key,
avatars fall back to initials. Music and album artwork are never uploaded:
administrators paste already-hosted URLs in the catalog manager at `/admin`
(see [docs/profiles-and-catalog-admin.md](docs/profiles-and-catalog-admin.md)).

### Production (Neon Postgres + Neon Auth)

```bash
cp .env.example .env       # fill in DATABASE_URL, NEON_AUTH_URL, …
npm run build              # builds the client into dist/
npm start                  # serves API + client on $PORT
```

With `DATABASE_URL` set, the same schema runs on Neon Postgres - dev and
production execute identical DDL.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Domain boundaries, data flow, player/visualizer design |
| [docs/database.md](docs/database.md) | Schema, migrations, relations, storage migration path |
| [docs/catalog-model.md](docs/catalog-model.md) | Provenance, rights model, content states, collections, roles |
| [docs/profiles-and-catalog-admin.md](docs/profiles-and-catalog-admin.md) | Member profiles, ImgBB avatars, the admin catalog manager |
| [docs/contextual-actions.md](docs/contextual-actions.md) | Right-click menus, ⋮ overflow, action sheets - one action model |
| [docs/radio.md](docs/radio.md) | Radio stations and deterministic selection |
| [docs/providers.md](docs/providers.md) | Provider adapters and their rules |
| [docs/visualizers.md](docs/visualizers.md) | Writing a visualizer mode |
| [docs/moderation.md](docs/moderation.md) | Catalog administration and content states |
| [docs/deployment.md](docs/deployment.md) | Deployment, env vars, security posture |
| [docs/privacy-and-data.md](docs/privacy-and-data.md) | Data inventory, third parties, account deletion, privacy audit |
| [docs/data-retention.md](docs/data-retention.md) | What is kept, for how long, and who controls it |
| [docs/incident-response.md](docs/incident-response.md) | Security incident runbook |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Reporting vulnerabilities |

## Contributing & support

There's a contribution path for everyone - musicians (release through the
community channels), listeners (metadata and rights reports,
translations, docs), and developers (fork → branch → change → PR; see
[CONTRIBUTING.md](CONTRIBUTING.md)). The in-app **Contribute** page
summarizes all of them.

ResonTune has no subscriptions or ads; infrastructure is community-supported.
The in-app **Support** page lists the active methods (GitHub Sponsors,
Sociabuzz, QRIS). All of them are external links - ResonTune never collects
payment credentials. Instance operators configure the links via
`GITHUB_SPONSORS_URL` / `SOCIABUZZ_URL` / `QRIS_IMAGE_URL` (see
`.env.example`) or live from the admin section of the Settings page - no
rebuild needed.

## Principles

1. Listening comes first.
2. No account required for basic listening.
3. Local music is a first-class citizen.
4. Community creators are first-class citizens.
5. Respect licensing and provider rules - visibly.
6. No artificial premium walls.
7. No lock-in: JSON + M3U export are built in.
8. The player is a product, not a footer widget.
9. The visualizer is part of ResonTune's identity.
10. Real functionality over impressive mockups.

## Stack

React 19 · TypeScript · Vite · zustand · Express · Neon Postgres
(PGlite embedded in dev) · IndexedDB (idb) · Web Audio API ·
Media Session API · PWA. No CSS framework - the visual system is
hand-built (`src/styles/global.css`).

## License

[MIT](LICENSE). Music released by the community
remains the property of its rights holders - see track pages for per-track
licensing.
