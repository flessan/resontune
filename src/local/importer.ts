/**
 * Local file import: parse tags with music-metadata, extract embedded
 * artwork, and persist everything to IndexedDB.
 */
import { parseBlob } from 'music-metadata';
import type { LocalTrack } from '@/lib/types';
import { saveLocalTrack } from './db';

const AUDIO_TYPES = /^audio\//;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|webm)$/i;

export function isAudioFile(file: File): boolean {
  return AUDIO_TYPES.test(file.type) || AUDIO_EXT.test(file.name);
}

export interface ImportResult {
  imported: LocalTrack[];
  skipped: string[];
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  const imported: LocalTrack[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (!isAudioFile(file)) {
      skipped.push(file.name);
      continue;
    }
    try {
      const id = crypto.randomUUID();
      let title = file.name.replace(/\.[^.]+$/, '');
      let artist = 'Unknown artist';
      let album: string | null = null;
      let duration: number | null = null;
      let genre: string | null = null;
      let year: number | null = null;
      let artwork: Blob | null = null;

      try {
        const meta = await parseBlob(file, { duration: true });
        if (meta.common.title) title = meta.common.title;
        if (meta.common.artist) artist = meta.common.artist;
        if (meta.common.album) album = meta.common.album;
        if (meta.common.genre?.length) genre = meta.common.genre[0];
        if (meta.common.year) year = meta.common.year;
        if (meta.format.duration) duration = meta.format.duration;
        const pic = meta.common.picture?.[0];
        if (pic) {
          const bytes = pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data as ArrayBuffer);
          const copy = new Uint8Array(bytes); // detach from parser buffers
          artwork = new Blob([copy.buffer as ArrayBuffer], { type: pic.format || 'image/jpeg' });
        }
      } catch {
        /* unparseable tags — fall back to filename */
      }

      const track: LocalTrack = {
        id,
        fileName: file.name,
        title,
        artist,
        album,
        duration,
        addedAt: Date.now(),
        favorite: false,
        size: file.size,
        mimeType: file.type || 'audio/mpeg',
        hasArtwork: Boolean(artwork),
        genre,
        year,
      };
      await saveLocalTrack(track, file, artwork);
      imported.push(track);
    } catch (err) {
      console.warn('[local] failed to import', file.name, err);
      skipped.push(file.name);
    }
  }
  return { imported, skipped };
}
