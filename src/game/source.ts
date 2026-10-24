/**
 * Load audio for Flow. Catalog streams go through /api/play; local files
 * stay on the device. Nothing is uploaded.
 */
import { GameAudio } from './audio';
import { resolveRemotePlayback } from '@/providers';
import { getLocalBlob } from '@/local/db';
import { api } from '@/lib/api';
import type { Track } from '@/lib/types';
import type { SongRef } from './types';

export async function bufferFromBlob(blob: Blob, audio: GameAudio): Promise<AudioBuffer> {
  return audio.decode(await blob.arrayBuffer());
}

export async function loadLocalSong(id: string, title: string, artist: string, audio: GameAudio): Promise<{ song: SongRef; buffer: AudioBuffer }> {
  const blob = await getLocalBlob(id);
  if (!blob) throw new Error('That local file is no longer on this device.');
  const buffer = await bufferFromBlob(blob, audio);
  return {
    buffer,
    song: {
      key: `local:${id}`,
      title,
      artist,
      kind: 'local',
      localId: id,
      duration: buffer.duration,
    },
  };
}

export async function loadFileSong(file: File, audio: GameAudio): Promise<{ song: SongRef; buffer: AudioBuffer }> {
  const buffer = await bufferFromBlob(file, audio);
  return {
    buffer,
    song: {
      key: `file:${file.name}:${file.size}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'This device',
      kind: 'file',
      duration: buffer.duration,
    },
  };
}

export async function loadCatalogSong(track: Track, audio: GameAudio): Promise<{ song: SongRef; buffer: AudioBuffer }> {
  const resolved = await resolveRemotePlayback(track.id);
  if (resolved.type === 'unavailable') throw new Error(resolved.reason);
  if (resolved.type === 'external') {
    throw new Error('This track is an external link, so Flow can’t chart it.');
  }
  const res = await fetch(resolved.url);
  if (!res.ok) throw new Error('Could not load audio for this track.');
  const buffer = await audio.decode(await res.arrayBuffer());
  return {
    buffer,
    song: {
      key: `catalog:${track.id}`,
      title: track.title,
      artist: track.artist.name,
      kind: 'catalog',
      trackId: track.id,
      trackSlug: track.slug,
      artworkUrl: track.artworkUrl,
      duration: track.duration ?? buffer.duration,
    },
  };
}

export async function fetchTrackBySlug(slug: string): Promise<Track> {
  const data = await api.get<{ track: Track }>(`/tracks/${slug}`);
  return data.track;
}

export async function fetchCatalogSlice(): Promise<Track[]> {
  try {
    const data = await api.get<{ tracks: Track[] }>('/tracks?limit=16');
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch {
    return [];
  }
}
