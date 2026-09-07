import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalTrack } from '@/lib/types';
import { listLocalTracks } from '@/local/db';
import { importFiles, isAudioFile } from '@/local/importer';
import { LocalTrackRow } from '@/components/LocalTrackRow';
import { usePlayer } from '@/player/store';
import { localTrackToQueueItem, resolveLocalArtworkUrl } from '@/providers';
import { formatBytes } from '@/lib/format';
import { toast } from '@/stores/toast';
import { IconPlay, IconUpload, IconDownload } from '@/components/Icons';
import { LibraryTabs } from '@/components/LibraryTabs';

type Filter = 'all' | 'favorites';

export default function Library() {
  const [tracks, setTracks] = useState<LocalTrack[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [over, setOver] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    void listLocalTracks().then(setTracks);
  }, []);

  useEffect(reload, [reload]);

  const handleFiles = async (files: File[]) => {
    const audio = files.filter(isAudioFile);
    if (!audio.length) {
      toast('No audio files found in the selection.');
      return;
    }
    setImporting(true);
    const res = await importFiles(audio);
    setImporting(false);
    if (res.imported.length) toast(`Imported ${res.imported.length} track${res.imported.length > 1 ? 's' : ''}`);
    if (res.skipped.length) toast(`Skipped ${res.skipped.length} file${res.skipped.length > 1 ? 's' : ''}`);
    reload();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  };

  const filtered = (tracks ?? [])
    .filter((t) => (filter === 'favorites' ? t.favorite : true))
    .filter((t) =>
      query ? `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(query.toLowerCase()) : true,
    );

  const playAll = async () => {
    if (!filtered.length) return;
    const items = await Promise.all(
      filtered.map(async (t) => localTrackToQueueItem(t, t.hasArtwork ? await resolveLocalArtworkUrl(t.id) : null)),
    );
    void usePlayer.getState().playQueue(items, 0);
  };

  const exportLibrary = () => {
    const data = {
      format: 'resontune-local-library',
      version: 1,
      exportedAt: new Date().toISOString(),
      tracks: (tracks ?? []).map((t) => ({
        title: t.title, artist: t.artist, album: t.album, duration: t.duration,
        fileName: t.fileName, favorite: t.favorite, genre: t.genre, year: t.year,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resontune-local-library.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalSize = (tracks ?? []).reduce((s, t) => s + t.size, 0);

  return (
    <div className="page">
      <h1 className="page-title">Library</h1>
      <p className="page-sub">
        Your files, your device. Music you add here is stored in your browser
        (IndexedDB) and is never uploaded anywhere.
      </p>
      <LibraryTabs />

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Add music files"
      >
        <IconUpload width={28} height={28} style={{ opacity: 0.5 }} />
        <h3>{importing ? 'Importing…' : 'Drop audio files here'}</h3>
        <p style={{ margin: 0, fontSize: 13 }}>
          or click to choose files - MP3, M4A, OGG, FLAC, WAV, Opus
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.wav,.webm"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void handleFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
      </div>

      {tracks === null ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : tracks.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          <h3>Your library is empty</h3>
          <p>Add some music above. Tags and embedded artwork are read automatically.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '24px 0 14px', flexWrap: 'wrap' }}>
            <button className="btn primary small" onClick={() => void playAll()}>
              <IconPlay width={13} height={13} /> Play all
            </button>
            <div className="pill-row">
              <button className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All ({tracks.length})
              </button>
              <button className={`pill ${filter === 'favorites' ? 'active' : ''}`} onClick={() => setFilter('favorites')}>
                Favorites ({tracks.filter((t) => t.favorite).length})
              </button>
            </div>
            <input
              type="search"
              placeholder="Filter library…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter local library"
              className="input"
              style={{ marginLeft: 'auto', maxWidth: 220, padding: '7px 14px', fontSize: 13 }}
            />
            <button className="btn small" onClick={exportLibrary} title="Export library metadata as JSON">
              <IconDownload width={14} height={14} /> Export
            </button>
          </div>

          <div className="tracklist">
            {filtered.map((t, i) => (
              <LocalTrackRow key={t.id} track={t} index={i} context={filtered} onChanged={reload} />
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 14 }}>
            {tracks.length} tracks · {formatBytes(totalSize)} stored locally in this browser
          </p>
        </>
      )}
    </div>
  );
}
