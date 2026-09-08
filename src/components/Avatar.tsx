/**
 * Avatar with a deterministic fallback.
 *
 * Profile photos are hosted by ImgBB (uploaded through the server). When an
 * account has none - or the image fails to load - we render the initial on a
 * tonal surface instead of a broken image.
 */
import { useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  /** Marks this node as the shared-element partner for a profile hero. */
  shared?: boolean;
  /** Always-on view-transition name (detail heroes). */
  sharedName?: string;
}

export function Avatar({ src, name, size = 40, className = '', shared, sharedName }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? '').trim().slice(0, 1).toUpperCase() || '♪';
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.4)),
    ...(sharedName && !prefersReducedMotion() ? { viewTransitionName: sharedName } : undefined),
  };
  const sharedAttr = shared || sharedName ? '' : undefined;

  if (!src || failed) {
    return (
      <span className={`avatar avatar-fallback ${className}`} style={style} aria-hidden data-shared={sharedAttr}>
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
      data-shared={sharedAttr}
    />
  );
}
