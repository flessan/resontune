# Contributing to ResonTune

Thanks for wanting to help! ResonTune is a community project — code,
documentation, design, curation and moderation all count as contributions.

## Ground rules

- **Respect licensing.** Never add code that bypasses DRM, authentication,
  rate limits or paywalls, scrapes prohibited endpoints, or proxies protected
  streams. Provider adapters must use officially permitted mechanisms.
- **Listening comes first.** Don't gate existing free functionality behind
  accounts, and don't add artificial limits.
- **Local music stays local.** Nothing from the local library may be uploaded
  without an explicit, separate, opt-in feature.
- **No secrets in the repo.** Configuration goes through environment
  variables (`.env.example` documents them).

## Development setup

```bash
npm install
npm run dev:server     # API on :8787 (embedded Postgres via PGlite)
npm run dev            # Vite on :5173 (proxies /api and /media)
```

The database migrates itself and starts **empty** — that's by design; every
surface has an honest empty state. Use local music (Library page) for
playback during development, or publish test rows through SQL if you're
working on catalog features.

`npm run typecheck` and `npm test` must pass before you open a PR. The test
suite runs on Vitest + Testing Library in jsdom (`src/**/*.test.ts{,x}`).

## Project layout

```
server/          Express API, schema, migrations (Neon Postgres / PGlite)
src/player/      engine (audio element + Web Audio graph), store, UI
src/visualizer/  engine + modes/ (one file per visualizer)
src/providers/   provider abstraction (hosted, local, external)
src/local/       IndexedDB library + importer
src/contextmenu/ contextual action model, menus and action sheets
src/pages/       route components
docs/            architecture & operations documentation
```

## Adding things

- **A visualizer mode** — see [docs/visualizers.md](docs/visualizers.md).
  One file in `src/visualizer/modes/`, registered via `registerMode`.
- **A provider** — see [docs/providers.md](docs/providers.md). Implement
  `MusicProvider`, register it, and document the terms it complies with.
- **A contextual action** — see
  [docs/contextual-actions.md](docs/contextual-actions.md). Extend
  `buildActions` in `src/contextmenu/actions.ts`; never wire a one-off menu
  into a component.
- **API endpoints** — validate all input with zod, keep responses paginated
  and bounded, and never trust the client.

## Pull requests

1. Fork, branch from `main`.
2. Keep PRs focused; describe *why*, not just *what*.
3. `npm run typecheck && npm test && npm run build` must pass.
4. UI changes: include a screenshot, check keyboard navigation and
   `prefers-reduced-motion` behavior.

## Code of Conduct

Be excellent to each other — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
