/**
 * Radio — continuous listening without decisions. A station is just a
 * deterministic server-built queue (seeded shuffle over eligible tracks,
 * weighted by popularity) fed into the normal player queue. No AI, no
 * profiling: the ingredients are genre, provenance, artist, and plays.
 */
import { useState } from 'react';
import { useFetch } from '@/lib/useFetch';
import type { Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { IconWave } from '@/components/Icons';

interface GenreInfo { id: string; name: string; trackCount: number }

const BASE_STATIONS = [
  { station: 'all', name: 'ResonTune Radio', desc: 'Everything published on the platform — Originals and community, all genres.' },
  { station: 'originals', name: 'Originals Radio', desc: 'Only the ResonTune Originals catalog.' },
  { station: 'community', name: 'Community Radio', desc: 'Only releases from independent community artists.' },
];

export default function Radio() {
  const { data: genreData } = useFetch<{ genres: GenreInfo[] }>('/genres');
  const [starting, setStarting] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);

  const start = async (station: string) => {
    setStarting(station);
    try {
      const r = await api.get<{ tracks: Track[]; label: string; seed: number }>(
        `/radio?station=${encodeURIComponent(station)}`,
      );
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) {
        toast('This station has nothing to play yet.');
        return;
      }
      await usePlayer.getState().playQueue(items, 0);
      setNowPlaying(r.label);
      toast(`Now playing: ${r.label}`);
    } catch {
      toast('Could not start the station.');
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 6 }}>
        <h1 className="section-title" style={{ fontSize: 30 }}>Radio</h1>
        <span className="section-note">
          continuous queues built from genre, provenance and popularity — no algorithmic profiling
        </span>
      </div>

      {nowPlaying && (
        <p className="note-card" style={{ marginBottom: 22 }}>
          <IconWave width={14} height={14} /> Now playing <strong>{nowPlaying}</strong> — the queue
          is in your player; skip, shuffle and reorder like any other queue.
        </p>
      )}

      <div className="station-grid" style={{ marginBottom: 30 }}>
        {BASE_STATIONS.map((s) => (
          <button
            key={s.station}
            className="station-card"
            onClick={() => void start(s.station)}
            disabled={starting !== null}
            aria-busy={starting === s.station}
          >
            <div className="station-name">{s.name}</div>
            <div className="station-desc">{s.desc}</div>
          </button>
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">Genre stations</h2>
      </div>
      <div className="station-grid">
        {(genreData?.genres ?? []).filter((g) => g.trackCount > 0).map((g) => (
          <button
            key={g.id}
            className="station-card"
            onClick={() => void start(`genre:${g.id}`)}
            disabled={starting !== null}
          >
            <div className="station-name">{g.name}</div>
            <div className="station-desc">{g.trackCount} tracks in rotation</div>
          </button>
        ))}
      </div>

      <p style={{ marginTop: 34, fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: '60ch', lineHeight: 1.6 }}>
        You can also start a station from any artist or track page — Artist Radio
        blends their catalog with tracks that share their genres.
      </p>
    </div>
  );
}
