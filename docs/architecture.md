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
client from `dist/` - one deployable unit.

## Domain boundaries (client)

```
src/
  player/       playback engine + state + player UIs
  visualizer/   analysis-driven render engine + modes/
  providers/    playback resolution (server /api/play + local object URLs)
  contextmenu/  contextual action model (right-click, ⋮, action sheet)
  local/        IndexedDB library, importer (music-metadata)
  stores/       auth, settings, toasts (zustand)
  components/   shared UI (rows, tiles, dialogs, icons)
  pages/        one file per route domain
  lib/          api client, types, formatting, artwork color
```

## Responsive shell

One product, one information architecture, one player - only density and
presentation adapt. `.app` is a CSS grid: `sidebar | main` with a full-width
player row on desktop, and `main / player / tabs` rows below 860px. Because
the mini player and the navigation bar are *rows*, not floating overlays,
content is never hidden behind them and there is no dead space when nothing
is playing.

Four custom properties in `src/styles/global.css` carry the geometry:

| token | desktop | ≤860px | ≤400px |
| --- | --- | --- | --- |
| `--gutter` | 28px (24px ≤1100) | 20px | 16px |
| `--player-h` | 76px | 64px | 64px |
| `--tabbar-h` | 0 | `56px + safe-area` | same |
| `--sidebar-w` | 232px | - (drawer) | - |

Every page surface reads `--gutter` (`.page`, `.topbar`, `.shelf`,
`.seg-tabs`), so full-bleed scrollers can bleed to the screen edge while
their first item still lines up with the headings above it. `Layout` puts
`has-player` on `.app` while something is queued; `.app:not(.has-player)`
sets `--player-h: 0px`, which is how fixed overlays (toasts) know what to
clear without hardcoding a number.

Mobile specifics worth knowing:

- the header is its own design - hamburger, wordmark, a search *action* that
  opens the Search destination, and the account control at 44px; the desktop
  search field is hidden rather than squeezed;
- track rows drop the index and duration columns, grow to a 64px row with
  48px artwork, and move the "now playing" tell onto the artwork;
- detail heroes stack (artwork over title) instead of squeezing a thumbnail
  beside three lines of type;
- modal surfaces (drawer, dialogs, action sheet) take a reference-counted
  scroll lock (`src/lib/scrollLock.ts`) so the page behind them holds still;
- dialogs become bottom sheets under 640px.

`src/components/Shell.test.tsx` pins the parts of this that are behaviour
rather than pixels: the navigation destinations, the header search action,
`has-player`, accessible names in the mini player, and the drawer's scroll
lock.

## The player

- **One `HTMLAudioElement` for the app's lifetime** (`player/engine.ts`).
  Tracks change by swapping `src`; the element is never recreated. This is
  what keeps playback alive across route transitions.
- **Web Audio graph is lazy.** `createMediaElementSource` + `AnalyserNode`
  are attached on the first user gesture (`ensureAnalysis`). If Web Audio is
  unavailable, playback still works - only visualization degrades.
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

## Contextual actions

Every contextual affordance in the app - desktop right-click, the ⋮ overflow
button, the mobile action sheet - resolves through one pipeline: a component
registers a typed *target*, `buildActions(target, ctx)` derives the valid
actions from live state, and a single portalled surface renders them. Actions
call the existing player, auth and API layers; they never fork queue or
playlist state, and hidden actions are a courtesy on top of server
authorization, not a substitute for it. See
[docs/contextual-actions.md](contextual-actions.md).

## The visualizer

See [visualizers.md](visualizers.md). Key decision: modes consume a
*normalized* `AnalysisFrame` (bins, waveform, level, bass/mid/treble) - they
have no knowledge of the player. The runner owns canvas sizing, the clock
(speed-scaled, reduced-motion aware), and settings.

## Administration

`/admin` is a small internal CMS for the catalog (artists → releases →
tracks), not a separate app: same components, same tokens, denser layout.
It is lazily code-split, so listeners never download it. Reads require the
`moderator` role, writes require `admin`, and the server enforces both
independently of the UI. See
[profiles-and-catalog-admin.md](profiles-and-catalog-admin.md).

The one upload path in the product is a member's profile photo
(browser → API → ImgBB → URL in Postgres). Catalog audio and artwork are
administrator-verified external URLs; nothing in the server fetches them.

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
