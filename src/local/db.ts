/**
 * Local music library - IndexedDB.
 *
 * Audio files the user adds stay on their device. We store:
 *  - `tracks`   : metadata records (title/artist/album/duration/favorite…)
 *  - `blobs`    : the audio file bytes, keyed by track id
 *  - `artwork`  : embedded cover art extracted from tags
 *  - `kv`       : app state (playback position, queue snapshot, settings)
 *
 * Nothing here is ever uploaded to the server.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { LocalTrack } from '@/lib/types';

const DB_NAME = 'resontune-local';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        const tracks = d.createObjectStore('tracks', { keyPath: 'id' });
        tracks.createIndex('addedAt', 'addedAt');
        d.createObjectStore('blobs');
        d.createObjectStore('artwork');
        d.createObjectStore('kv');
        const playlists = d.createObjectStore('playlists', { keyPath: 'id' });
        playlists.createIndex('createdAt', 'createdAt');
      },
    });
  }
  return dbPromise;
}

/* --------------------------------- tracks --------------------------------- */

export async function listLocalTracks(): Promise<LocalTrack[]> {
  const d = await db();
  const all = await d.getAll('tracks');
  return (all as LocalTrack[]).sort((a, b) => b.addedAt - a.addedAt);
}

export async function getLocalTrack(id: string): Promise<LocalTrack | undefined> {
  const d = await db();
  return d.get('tracks', id);
}

export async function saveLocalTrack(track: LocalTrack, blob: Blob, artwork?: Blob | null): Promise<void> {
  const d = await db();
  const tx = d.transaction(['tracks', 'blobs', 'artwork'], 'readwrite');
  await tx.objectStore('tracks').put(track);
  await tx.objectStore('blobs').put(blob, track.id);
  if (artwork) await tx.objectStore('artwork').put(artwork, track.id);
  await tx.done;
}

export async function updateLocalTrack(track: LocalTrack): Promise<void> {
  const d = await db();
  await d.put('tracks', track);
}

export async function deleteLocalTrack(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['tracks', 'blobs', 'artwork'], 'readwrite');
  await tx.objectStore('tracks').delete(id);
  await tx.objectStore('blobs').delete(id);
  await tx.objectStore('artwork').delete(id);
  await tx.done;
}

export async function getLocalBlob(id: string): Promise<Blob | undefined> {
  const d = await db();
  return d.get('blobs', id);
}

export async function getLocalArtwork(id: string): Promise<Blob | undefined> {
  const d = await db();
  return d.get('artwork', id);
}

/* ----------------------------- local playlists ---------------------------- */

export interface LocalPlaylist {
  id: string;
  title: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export async function listLocalPlaylists(): Promise<LocalPlaylist[]> {
  const d = await db();
  const all = await d.getAll('playlists');
  return (all as LocalPlaylist[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveLocalPlaylist(p: LocalPlaylist): Promise<void> {
  const d = await db();
  await d.put('playlists', p);
}

export async function deleteLocalPlaylist(id: string): Promise<void> {
  const d = await db();
  await d.delete('playlists', id);
}

/* ----------------------------------- kv ----------------------------------- */

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return d.get('kv', key);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  await d.put('kv', value, key);
}
