# Visualizer architecture

The visualizer is part of ResonTune's identity: artistic, musical,
restrained. No neon, no fake 3D, no crypto aesthetics.

## Data flow

```
HTMLAudioElement ─► MediaElementSource ─► AnalyserNode ─► AnalysisFrame
                                                     │
                     VisualizerRunner (rAF loop) ◄───┘
                              │  normalized frame + theme palette + artwork
                              ▼
                      VisualizerMode.render(vc)
```

The **style** determines geometry and motion; the **theme** determines the
color language. A style receives three theme voices and nothing else:

- `accent`  - the theme primary (main motion)
- `secondary` - the theme secondary (companion elements)
- `paper`   - quiet structural ink (grids, idle bars, translucent layers)

They are read from the live CSS tokens by `readThemeVizPalette()`
(`src/theme/theme.ts`), so a custom palette recolors every style instantly
with no per-style configuration. On built-in themes the accent quietly
follows the playing artwork (`--player-tint`); under a custom theme the
user's primary *is* the identity and artwork extraction stands down.

`AnalysisFrame` (from `src/player/engine.ts`):

```ts
{
  freq: Uint8Array;     // frequency bins (0..255)
  wave: Uint8Array;     // time-domain waveform (128 = silence)
  level: number;        // smoothed overall level 0..1
  bass: number;         // 0..1
  mid: number;          // 0..1
  treble: number;       // 0..1
  sampleRate, binCount
}
```

Modes never touch the player. The runner owns the canvas, DPR sizing, the
speed-scaled clock, `prefers-reduced-motion` handling (the clock slows to
15%, temporal smoothing rises and intensity is capped - dampened, never
removed) and user settings.

## Where the visualizer lives

The visualizer is **ambient behavior of the player**, never a panel, card
or destination. It is on by default - press play and the interface reacts:

- **Compact player bar** - the *Minimal Spectrum* shares the row with the
  track metadata (`src/player/MiniSpectrum.tsx`: own rAF loop, edge-faded
  via CSS mask, settles on pause). No box, no reserved area.
- **Expanded player** - a full-width ambient canvas layered on the sheet
  surface itself, fading upward behind the controls; the artwork carries a
  barely-perceptible bass-responsive scale. Style selection lives in a
  contextual popover off the playback controls.
- **Immersive player** - the full-screen experience.

`bars` is the first-run default style; the user's choice persists in
localStorage and applies across expanded and immersive views.

## User settings

Deliberately two: **style** and **on/off**. The engine's internal
parameters (sensitivity, smoothing, intensity, …) exist in
`VisualizerSettings` but are not exposed as UI - the user expresses
themselves through the theme and the style, not through DSP knobs.
Both preferences persist in `resontune-settings` alongside the theme
and custom palette.

## Writing a mode

Create `src/visualizer/modes/mymode.ts`:

```ts
import { registerMode, smoothBins } from '../engine';

const buf = new Float32Array(48);          // persistent smoothing buffer

registerMode({
  id: 'mymode',
  name: 'My Mode',
  description: 'One honest sentence.',
  render({ ctx, w, h, t, frame, settings, accent, secondary, paper }) {
    const bins = smoothBins(frame, settings, buf, 48);
    // draw with ctx - respect settings.intensity/scale, use accent + paper
  },
});
```

Then import it in `src/visualizer/modes/index.ts`. It appears automatically
in Settings and the immersive player's mode picker.

Guidelines:

- Consume `settings` - at least intensity, scale and sensitivity.
- Speak only in the theme voices: `accent` (primary motion), `secondary`
  (companion elements) and `paper` (quiet ink); never hardcode a palette.
- Reuse buffers; never allocate per frame.
- `reducedMotion` is available if your mode has self-driven movement.

## Built-in styles

Wave · Bars · Scope · Corona · Ribbon · Hi-Fi · Vectorscope · Hyperspace ·
Outrun. Each is a distinct geometry, not the same waveform re-filtered.
Legacy stored ids (including the retired Waterfall) map onto this set via
`resolveModeIdSafe`.

Every style shares a small dynamics tracker (`Dyn` in `styles.ts`) that
turns raw analysis into musical gestures: a VU-eased level (fast attack,
slow release), a bass-onset "kick" envelope with a drum-like decay, and a
drive value that gives self-driven motion momentum. Transients punch,
sustains breathe, quiet passages settle - and pause freezes everything
because dt comes from the mode clock, not wall time.
