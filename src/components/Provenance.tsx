/**
 * Provenance UI. Every playable thing on ResonTune has an inspectable
 * origin; these are the small, consistent ways it shows up:
 *
 * - <OriginalBadge/>: the "RESONTUNE ORIGINAL" wordmark - typography only,
 *   no glow, used on tracks/releases/artists from the Originals catalog.
 * - <SourceChip/>: compact chip for community/local/external provenance.
 */
import type { SourceType } from '@/lib/types';

export function OriginalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`original-badge${compact ? ' compact' : ''}`} title="Released by ResonTune Originals">
      {compact ? 'ORIGINAL' : 'RESONTUNE ORIGINAL'}
    </span>
  );
}

export function SourceChip({
  sourceType,
  origin,
}: {
  sourceType?: SourceType | null;
  origin?: 'remote' | 'local';
}) {
  if (origin === 'local') {
    return <span className="source-chip local" title="A file on this device. Never uploaded.">Local</span>;
  }
  if (sourceType === 'original') return <OriginalBadge compact />;
  if (sourceType === 'community') {
    return <span className="source-chip community" title="Published through the ResonTune community program.">Community</span>;
  }
  if (sourceType === 'external') {
    return <span className="source-chip external" title="Playback via the official external source.">External</span>;
  }
  return null;
}

/** Human explanation of a track's origin, for detail views. */
export function provenanceLabel(sourceType?: SourceType | null, origin?: 'remote' | 'local'): string {
  if (origin === 'local') return 'Local device file - private to this browser.';
  switch (sourceType) {
    case 'original':
      return 'ResonTune Original - released and distributed by ResonTune.';
    case 'community':
      return 'Community release - submitted by the artist and published after review.';
    case 'external':
      return 'External source - played through the official provider.';
    default:
      return 'Catalog track.';
  }
}
