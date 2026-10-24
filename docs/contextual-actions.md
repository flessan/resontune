# Contextual actions

ResonTune has one contextual interaction system. A right-click on a track
row, a tap on a ⋮ button, and a long press on a tile all resolve to the same
target, derive the same list of actions and render the same surface. There
are no per-component action handlers scattered across the app.

## The pipeline

```
register a target   useContextTarget(target)      →  props on the DOM node
gesture             contextmenu / ⋮ / long-press  →  useContextMenu.openMenu()
derive actions      buildActions(target, ctx)     →  MenuAction[]
render              <ContextMenuRoot />           →  portal menu or bottom sheet
execute + close     action.run()                  →  player / API / navigation
```

Every step lives in `src/contextmenu/`:

| File | Responsibility |
| --- | --- |
| `types.ts` | The `ContextTarget` union, `MenuAction`, action groups, small refs (`artistRef`, `releaseRef`, `playlistRef`) |
| `actions.ts` | `buildActions(target, ctx)` - the single source of truth for what a target can do |
| `store.ts` | The one open menu: target, anchor, opener, source |
| `useContextTarget.ts` | Target registration and gesture policy (right-click, long-press, `ContextMenu`/`Shift+F10`) |
| `ContextMenuRoot.tsx` | Positioning, keyboard model, motion, portal, action sheet |
| `ContextMenuButton.tsx` | The ⋮ trigger, anchored to itself |

## Targets

```ts
type ContextTarget =
  | { type: 'track'; track: Track; context?: Track[]; playlist?: { id; title; owned }; onChanged?: () => void }
  | { type: 'artist'; artist: ArtistRef }
  | { type: 'release'; release: ReleaseRef }
  | { type: 'playlist'; playlist: PlaylistRef; onChanged?: () => void }
  | { type: 'queue-item'; item: QueueItem; index: number }
  | { type: 'admin-artist' | 'admin-release' | 'admin-track'; entity: AdminEntityRef; onChanged?: () => void }
```

`context` is the list a track was rendered in, so "Play" from a row builds the
same queue clicking the row would. `playlist` is set only where a row lives
inside a playlist the signed-in user owns, which is what unlocks "Remove from
this playlist".

## Deriving actions

`buildActions` receives live application state - route, user, favourites, the
player queue - and returns only actions that are valid *right now*. There are
no disabled rows: an unplayable track has no Play, a track with no release has
no "Go to release", a playing queue entry has no "Play next".

Two rules matter:

- **Actions reuse domain logic.** Playback goes through `usePlayer`, entity
  playback through `src/lib/entityPlayback.ts`, favourites through `useAuth`,
  playlist and catalog mutations through the same API routes the pages use.
  Nothing is reimplemented, and no second queue exists.
- **Client-side visibility is courtesy, not authorization.** Owner-only and
  admin-only actions are hidden because showing them would be dishonest, but
  the server still authorizes every mutation (`requireAuth`, `requireAdmin`,
  ownership checks in `server/routes/playlists.ts`).

Groups are semantic, and separators are drawn only between groups that are
actually present:

`playback → queue → library → navigate → share → manage → danger`

## Gesture policy

The app never takes the browser's own context menu away from ordinary
content. `useContextTarget` calls `preventDefault()` only when all of these
hold:

- the node is a registered music entity;
- `Shift` is not held (the deliberate escape hatch);
- the event did not originate in an input, textarea, select or
  `contenteditable` region (or anything marked `data-native-menu`);
- there is no live text selection under the pointer, so Copy keeps working.

Nested targets resolve innermost-first, because the inner handler stops
propagation. Long press (480 ms, 10 px slop, touch pointers only) opens the
sheet and swallows the click that would otherwise play the row.

## Keyboard and ARIA

- `ContextMenu` / `Shift+F10` open the menu anchored to the element.
- `ArrowDown`/`ArrowUp` wrap, `Home`/`End` jump, `Enter`/`Space` run,
  `Escape` closes, `Tab` closes and lets focus continue naturally.
- The surface is `role="menu"` with `aria-label="Actions for <name>"`; items
  are `role="menuitem"` with roving `tabindex`.
- Focus returns to the opener on close. A row is a `<div>`, so the keyboard was
  never on the row itself but on a link or button inside it: that element is
  remembered as the opener and gets focus back. If it cannot take focus (an
  unfocusable container, or a row that has since unmounted), focus lands on the
  main scroll container rather than on `<body>`. Focus is not trapped - a
  context menu is not a modal.
- The pointer-opened menu is measured behind `visibility: hidden` for one
  frame; it takes focus after that pass, because a hidden element cannot be
  focused and `Escape` would otherwise go nowhere in a real browser.

## Positioning

The menu is portalled to `document.body` and positioned `fixed`, so it cannot
be clipped by an overflow container or displaced by a transformed ancestor,
and it stacks above the player (`z-index: 100`) and dialogs (`120`) at `190`,
below toasts (`200`).

Placement measures the rendered menu, then flips and clamps it inside the
viewport with an 8 px margin; the transform origin follows the chosen corner
so the open animation grows from the cursor. Scroll, resize and window blur
dismiss rather than chase the anchor.

## Motion

A 120 ms fade with a 0.97 scale and a 2 px lift on entry, 110 ms on exit,
using the existing `--dur-*` and `--ease-*` tokens. Under
`prefers-reduced-motion: reduce` the animations are removed and closing is
immediate.

## Mobile

On a coarse pointer the same action list renders as a bottom sheet with a
title, the target kind and larger hit areas. Presentation differs;
semantics do not. Tiles and rows expose a ⋮ trigger so the actions are
discoverable without knowing about long press.

The sheet behaves like a native one:

- the page behind it does not scroll (reference-counted lock in
  `src/lib/scrollLock.ts`), so it also never dismisses itself when a finger
  brushes the list underneath - unlike the floating menu, whose anchor
  scrolls away and which therefore still closes on scroll;
- a downward drag on its header dismisses it, as does a tap on the
  backdrop, Escape, or running an action;
- items are 52px tall with the destructive group separated at the end, and
  destructive actions still route through a confirmation dialog.

A pending long press always loses to a scroll: movement past 10px cancels
it, and so does any scroll or wheel event while the finger is down (a fling
can stop pointer events reaching us). The click that would follow a long
press is swallowed, so a press never plays the row it opened a menu for.

## Dialogs

Actions run far from the component that rendered them, so flows that need
input ask `src/stores/dialogs.ts` for it:

```ts
const title = await dialogs.prompt({ title: 'Rename playlist', value: playlist.title });
const ok    = await dialogs.confirm({ title: 'Delete “…”?', danger: true });
dialogs.addToPlaylist(trackIds, label);
```

`DialogHost` (mounted once in `Layout`) renders them. This replaced the
`window.prompt` / `window.confirm` calls on the playlist page.

## Where menus are attached

Track rows and track tiles, artist/release/playlist tiles and cards, the
artist / release / track / playlist detail headers, profile music sections,
queue rows, the persistent player's now-playing area, and the admin catalog
lists. Anything that repeats a music entity gets one; decorative surfaces do
not.

## Staying honest while open

The menu is derived state, and it closes rather than lie:

| change while open | behaviour |
| --- | --- |
| route change | closes (the context it was opened from is gone) |
| sign in / sign out | closes - ownership, admin rights and favourites all change |
| target loses every valid action (deleted, dequeued) | closes |
| the row it was opened from unmounts | closes cleanly; focus falls back to the scroll container instead of a detached node |
| viewport resize, window blur | closes |
| scroll (pointer menu only) | closes |

Listeners are attached only while a menu is open, all on `document` /
`window`, and every one is removed in the same effect's cleanup - asserted
in `ContextMenu.mobile.test.tsx`.

## Tests

`src/contextmenu/actions.test.ts` covers the action model (per-type sets,
favourite state, ownership, admin roles, queue semantics against the real
player store). `src/contextmenu/ContextMenu.test.tsx` covers the surface:
right-click opens the correct menu, ordinary content keeps the browser menu,
keyboard navigation, Escape and focus restoration, dismissal, viewport
clamping, reduced motion, and the mobile sheet.
`src/contextmenu/ContextMenu.mobile.test.tsx` covers the touch half and the
state hygiene above: long press opening the sheet, scroll and slop
cancellation, the scroll lock, drag-to-dismiss, closing on identity change
and on an emptied action list, listener cleanup, and focus restoration.
Run them with `npm test`.
