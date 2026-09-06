import { useRef, useState } from 'react';

/** Artwork with graceful fallback glyph and a gentle load fade. */
export function Artwork({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  if (!src || failed) {
    return <div className={`art-fallback ${className ?? ''}`} aria-hidden>♪</div>;
  }
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      /* cached images fire onLoad before hydration; check .complete */
      className={`${className ?? ''} ${loaded || ref.current?.complete ? 'img-loaded' : 'img-loading'}`}
    />
  );
}
