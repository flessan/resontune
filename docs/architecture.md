# Architecture

ResonTune is a two-process app in development and a single process in
production:

```
┌──────────────┐   /api, /media (proxy)   ┌──────────────────────────┐
│ Vite (5173)  │ ───────────────────────► │ Express API (8787)       │
│ React client │                          │ ├─ Neon Postgres (prod)  │
└──────────────┘                          │ └─ PGlite (dev, embedded)│
                                          └──────────────────────────┘
```

In production (`npm run build && npm start`) Express also serves the built
client from `dist/` — one deployable unit.

## Domain boundaries (client)

```
src/
  player/       playback engine + state + player UIs
  visualizer/   analysis-driven render engine + modes/
  providers/    playback resolution (server /api/play + local object URLs)
  local/        IndexedDB library, importer (music-metadata)
  stores/       auth, settings, toasts (zustand)
  components/   shared UI (rows, tiles, dialogs, icons)
  pages/        one file per route domain
  lib/          api client, types, formatting, artwork color
```

## The player

- **One `HTMLAudioElement` for the app's lifetime** (`player/engine.ts`).
  Tracks change by swapping `src`; the element is never recreated. This is
  what keeps playback alive across route transitions.
- **Web Audio graph is lazy.** `createMediaElementSource` + `AnalyserNode`
  are attached on the first user gesture (`ensureAnalysis`). If Web Audio is
  unavailable, playback still works — only visualization degrades.
- **Two frequencies of state.**
  - Coarse state (current item, playing, duration, queue) lives in a zustand
    store and re-renders React normally.
  - High-frequency state (currentTime, analysis frames) flows through
    subscription callbacks (`engine.onTime`) and direct DOM/canvas writes.
    The seek bar and visualizer never trigger React renders per frame.
- **Persistence.** Queue, index, position, volume and modes snapshot to
  IndexedDB every 10s and on track change; a reload restores the queue
  paused at the same position.
- **Media Session** metadata + handlers are wired in `player/store.ts`.

Presentation modes: **Compact** (persistent bar), **Expanded** (full sheet
with queue/lyrics/about), **Immersive** (fullscreen visualizer).

## The visualizer

See [visualizers.md](visualizers.md). Key decision: modes consume a
*normalized* `AnalysisFrame` (bins, waveform, level, bass/mid/treble) — they
have no knowledge of the player. The runner owns canvas sizing, the clock
(speed-scaled, reduced-motion aware), and settings.

## Source identity

Every queue item carries `origin: 'remote' | 'local'`, surfaced in the UI as
a `LOCAL` chip. Remote tracks carry explicit `sources[]` records
(provider/kind/url) from the `track_sources` table; local tracks resolve to
object URLs from IndexedDB blobs at play time.

## Discovery logic (deliberately simple)

- **Trending** = play events in the last 14 days (fallback: all-time plays).
- **Rising artists** = plays weighted against catalog size.
- **Related tracks** = shares a genre, different artist, ordered by plays.
- **Community picks** = human-curated rows in `community_picks`.

All deterministic, all explained in the UI ("most played in the last two
weeks"), no ML.

## Future: Listening Rooms

The schema and provider model leave room for synchronous listening: a room
would be a server-owned queue with a authoritative clock; clients follow via
SSE/WebSocket. Nothing in the player couples playback position to local-only
state, so a "follow remote clock" mode can be added without rewriting.
