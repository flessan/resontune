/**
 * Avatar with a deterministic fallback.
 *
 * Profile photos are hosted by ImgBB (uploaded through the server). When an
 * account has none - or the image fails to load - we render the initial on a
 * tonal surface instead of a broken image.
 */
import { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? '').trim().slice(0, 1).toUpperCase() || '♪';
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) };

  if (!src || failed) {
    return (
      <span className={`avatar avatar-fallback ${className}`} style={style} aria-hidden>
        {initial}
      </span>
    );
  }
  return (
    <img
      className={`avatar ${className}`}
      style={style}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
