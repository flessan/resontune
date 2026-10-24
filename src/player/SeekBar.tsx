import { useEffect, useRef, useCallback } from 'react';
import { engine } from './engine';
import { usePlayer } from './store';
import { formatDuration } from '@/lib/format';

/**
 * Seek bar that follows playback via direct DOM updates (no React re-render
 * per frame). Click/drag/keyboard to seek.
 */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    return engine.onTime((t, d) => {
      if (dragging.current) return;
      const pct = d > 0 ? (t / d) * 100 : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (timeRef.current) timeRef.current.textContent = formatDuration(t);
      if (totalRef.current) totalRef.current.textContent = formatDuration(d);
    });
  }, []);

  const seekFromEvent = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const dur = engine.audio.duration || 0;
    if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
    if (dur > 0) usePlayer.getState().seekTo(pct * dur);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) seekFromEvent(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dur = engine.audio.duration || 0;
    if (!dur) return;
    if (e.key === 'ArrowRight') {
      usePlayer.getState().seekTo(Math.min(dur, engine.audio.currentTime + 5));
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      usePlayer.getState().seekTo(Math.max(0, engine.audio.currentTime - 5));
      e.preventDefault();
    }
  };

  return (
    <div className="pb-seek">
      {!compact && <span className="pb-time" ref={timeRef} style={{ textAlign: 'right' }}>0:00</span>}
      <div
        className="seek-track"
        ref={trackRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="seek-rail">
          <div className="seek-fill" ref={fillRef} style={{ width: 0 }} />
        </div>
      </div>
      {!compact && <span className="pb-time" ref={totalRef}>0:00</span>}
    </div>
  );
}
