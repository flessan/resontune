# Visualizer architecture

The visualizer is part of ResonTune's identity: artistic, musical,
restrained. No neon, no fake 3D, no crypto aesthetics.

## Data flow

```
HTMLAudioElement ─► MediaElementSource ─► AnalyserNode ─► AnalysisFrame
                                                     │
                     VisualizerRunner (rAF loop) ◄───┘
                              │  normalized frame + settings + accent + artwork
                              ▼
                      VisualizerMode.render(vc)
```

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
15%, temporal smoothing rises and intensity is capped — dampened, never
removed) and user settings.

## Where the visualizer lives

The visualizer is on by default — no tab or setting required:

- **Compact player bar** — a small always-on *Minimal Spectrum*
  (`src/player/MiniSpectrum.tsx`, its own rAF loop, settles on pause).
- **Expanded player** — a wider spectrum strip with a mode dropdown and
  Sensitivity / Intensity / Speed sliders.
- **Immersive player** — the full-screen experience with all settings.

`minimal` is the first-run default mode; the user's choice persists in
localStorage and applies across expanded and immersive views.

## User settings

`sensitivity · intensity · speed · opacity · smoothing · scale · background`
— editable in Settings, in the expanded player's quick controls, and live
inside the immersive player; persisted in localStorage.

## Writing a mode

Create `src/visualizer/modes/mymode.ts`:

```ts
import { registerMode, smoothBins } from '../engine';

const buf = new Float32Array(48);          // persistent smoothing buffer

registerMode({
  id: 'mymode',
  name: 'My Mode',
  description: 'One honest sentence.',
  render({ ctx, w, h, t, frame, settings, accent, paper }) {
    const bins = smoothBins(frame, settings, buf, 48);
    // draw with ctx — respect settings.intensity/scale, use accent + paper
  },
});
```

Then import it in `src/visualizer/modes/index.ts`. It appears automatically
in Settings and the immersive player's mode picker.

Guidelines:

- Consume `settings` — at least intensity, scale and sensitivity.
- Use the `accent` color (extracted live from the playing artwork) and
  `paper` neutral; avoid hardcoding your own palette.
- Reuse buffers; never allocate per frame.
- `reducedMotion` is available if your mode has self-driven movement.

## Built-in modes

Waveform · Circular Spectrum · Organic · Geometric · Minimal Spectrum ·
Album Reactive · Typography · Procedural.
