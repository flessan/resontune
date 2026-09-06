import { useState } from 'react';

/** Artwork with graceful fallback glyph. */
export function Artwork({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`art-fallback ${className ?? ''}`} aria-hidden>♪</div>;
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}
