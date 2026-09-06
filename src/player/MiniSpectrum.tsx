/**
 * Minimal Spectrum — the default, always-on visual response in the player
 * bar. A tiny canvas that reads real analysis frames straight from the
 * audio engine inside its own rAF loop; React state is never touched per
 * frame. When playback pauses the bars settle gently instead of vanishing;
 * once settled, the loop stops to save cycles.
 *
 * Respects prefers-reduced-motion by smoothing harder and halving the
 * frame rate — the spectrum stays readable, it just moves less.
 */
import { useEffect, useRef } from 'react';
import { engine } from './engine';
import { usePlayer } from './store';

const BARS = 20;

export function MiniSpectrum({ bars = BARS, className }: { bars?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playing = usePlayer((s) => s.playing);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const levels = new Float32Array(bars);
    let raf: number | null = null;
    let settled = false;
    let frameToggle = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    resize();

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d97f4e';
    const ink = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--ink-faint').trim() || '#9a938a';

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const gap = w / (bars * 2);
      const barW = Math.max(1.5, gap * 0.9);
      const accentColor = accent();
      const inkColor = ink();
      for (let i = 0; i < bars; i++) {
        const v = levels[i];
        const bh = Math.max(h * 0.06, v * h * 0.92);
        const x = gap * (i * 2) + gap / 2;
        ctx.fillStyle = i === Math.floor(bars * 0.3) || i === Math.floor(bars * 0.7) ? accentColor : inkColor;
        ctx.globalAlpha = 0.3 + v * 0.7;
        ctx.fillRect(x, h - bh, barW, bh);
      }
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Reduced motion: render every other frame (~30fps) with heavy smoothing.
      frameToggle = !frameToggle;
      if (reduced && frameToggle) return;

      const isPlaying = playingRef.current;
      const frame = isPlaying ? engine.readFrame() : null;
      const alpha = reduced ? 0.08 : isPlaying ? 0.35 : 0.12;
      let energy = 0;

      if (frame) {
        const usable = Math.floor(frame.binCount * 0.7);
        const step = Math.max(1, Math.floor(usable / bars));
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += frame.freq[i * step + j] ?? 0;
          const target = Math.min(1, sum / (step * 255) * 1.35);
          levels[i] += (target - levels[i]) * alpha;
          energy += levels[i];
        }
        settled = false;
      } else {
        // Paused / no graph: settle each bar toward a low resting height.
        for (let i = 0; i < bars; i++) {
          levels[i] += (0 - levels[i]) * alpha;
          energy += levels[i];
        }
        if (energy < 0.01 && settled) return; // fully settled → keep last frame
        if (energy < 0.01) settled = true;
      }
      draw();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [bars]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? 'mini-spectrum'}
      aria-hidden="true"
    />
  );
}
