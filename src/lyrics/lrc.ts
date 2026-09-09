/**
 * LRC (timestamped lyrics) parsing.
 *
 * LRCLIB's `syncedLyrics` field is standard LRC text: `[mm:ss.xx] line`,
 * optionally with several timestamps per line and metadata tags like
 * `[ar:Artist]`. The parser is deliberately forgiving - a malformed line
 * is kept as plain text at the previous timestamp rather than thrown away,
 * and completely unparseable input simply yields no synced lines.
 *
 * The raw LRC text is always preserved alongside the parsed model so a
 * user editing their local copy works on the original timestamps.
 */

export interface LyricLine {
  /** seconds from the start of the track */
  time: number;
  text: string;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[[a-zA-Z#][^\]]*\]$/;

/** Parse LRC text into time-sorted lines. Returns [] when nothing parses. */
export function parseLrc(raw: string | null | undefined): LyricLine[] {
  if (!raw || typeof raw !== 'string') return [];
  const out: LyricLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Pure metadata tags ([ar:..], [ti:..], [offset:..]) are not lyrics.
    if (META_TAG.test(trimmed) && !/^\[\d/.test(trimmed)) continue;

    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIME_TAG.exec(trimmed)) !== null) {
      // Only leading, back-to-back tags count as timestamps for this line.
      if (m.index !== lastEnd) break;
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracRaw = m[3] ?? '0';
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      if (Number.isFinite(min) && Number.isFinite(sec) && sec < 60) {
        stamps.push(min * 60 + sec + (Number.isFinite(frac) ? frac : 0));
      }
      lastEnd = m.index + m[0].length;
    }
    if (stamps.length === 0) continue;
    const text = trimmed.slice(lastEnd).trim();
    for (const time of stamps) out.push({ time, text });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/** True when the text looks like it carries at least one LRC timestamp. */
export function looksSynced(raw: string | null | undefined): boolean {
  return parseLrc(raw).length > 0;
}

/**
 * The line that should be highlighted at playback time `t` - the last line
 * whose timestamp has passed. -1 before the first line. Binary search so
 * per-tick lookups stay cheap even for long songs.
 */
export function activeLineIndex(lines: LyricLine[], t: number): number {
  if (!lines.length || !Number.isFinite(t)) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
