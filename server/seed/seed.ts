/**
 * ResonTune launch catalog seed.
 *
 * ── ResonTune Originals — Founding Catalog ─────────────────────────────────
 * The Originals artists here are FICTIONAL label identities created for the
 * platform's launch catalog. All audio is original music composed and
 * rendered by scripts/generate-audio.cjs (procedural composition) and
 * released by ResonTune under CC0 — so ResonTune genuinely holds the rights
 * it claims (there are none reserved). Nothing here impersonates real
 * people. In the product UI this is presented as the Originals launch
 * catalog; this file is the honest record of where it comes from.
 *
 * ── Community catalog ──────────────────────────────────────────────────────
 * Two fictional independent creators seeded through the same shape the
 * moderation pipeline produces, so the Community section demonstrates the
 * real submission→publication model.
 *
 * Runs once when the tracks table is empty; also via `npm run seed`.
 * Identical behavior on Neon Postgres and PGlite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, migrate, uuid } from '../db/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------- static data ------------------------------ */

const LICENSES = [
  { id: 'cc0-1.0', name: 'CC0 1.0 (Public Domain)', url: 'https://creativecommons.org/publicdomain/zero/1.0/', summary: 'No rights reserved. Free to use for any purpose.', attribution: false },
  { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', summary: 'Free to share and adapt with attribution.', attribution: true },
  { id: 'cc-by-sa-4.0', name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', summary: 'Attribution + share-alike.', attribution: true },
  { id: 'cc-by-nc-4.0', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/', summary: 'Attribution, non-commercial use only.', attribution: true },
  { id: 'all-rights-reserved', name: 'All rights reserved', url: null, summary: 'Streaming permitted on ResonTune with the rights holder’s permission. No redistribution.', attribution: true },
];

const GENRES = [
  ['indie-electronic', 'Indie Electronic'],
  ['ambient', 'Ambient'],
  ['folktronica', 'Folktronica'],
  ['downtempo', 'Downtempo'],
  ['post-rock', 'Post-Rock'],
  ['instrumental', 'Instrumental'],
  ['bedroom-pop', 'Bedroom Electronic'],
  ['chiptune-adjacent', 'Melodic Electronic'],
] as const;

const TAGS = [
  ['late-night', 'late night'], ['warm', 'warm'], ['melancholic', 'melancholic'],
  ['uplifting', 'uplifting'], ['focus', 'focus'], ['rainy-day', 'rainy day'],
  ['travel', 'travel'], ['organic', 'organic'], ['playful', 'playful'],
] as const;

interface SeedTrack {
  file: string;
  title: string;
  no?: number;
  genres: string[];
  tags: string[];
  plays: number;
  description?: string;
  lyrics?: string;
}

interface SeedAlbum {
  slug: string;
  title: string;
  type: 'album' | 'ep' | 'single';
  released: string;
  art: string;
  catalogNo?: string;
  description: string;
  tracks: SeedTrack[];
}

interface SeedArtist {
  slug: string;
  name: string;
  location: string;
  bio: string;
  image: string;
  links: { kind: string; label: string; url: string }[];
  albums: SeedAlbum[];
}

/* ═══════════════ ResonTune Originals — Founding Catalog ═══════════════ */

const ORIGINALS: SeedArtist[] = [
  {
    slug: 'marlow-ferris',
    name: 'Marlow Ferris',
    location: 'Bristol, UK',
    bio: 'Marlow Ferris writes small, glowing electronic songs about buses, corner shops, and the hour after everyone else has gone home. One of the founding voices of the ResonTune Originals catalog.',
    image: '/artwork/artist-marlow.jpg',
    links: [
      { kind: 'bandcamp', label: 'Bandcamp', url: 'https://bandcamp.com' },
      { kind: 'kofi', label: 'Ko-fi', url: 'https://ko-fi.com' },
      { kind: 'website', label: 'marlowferris.example', url: 'https://example.com' },
    ],
    albums: [
      {
        slug: 'paper-lanterns', title: 'Paper Lanterns', type: 'album',
        released: '2025-11-14', art: '/artwork/album-paper-lanterns.jpg', catalogNo: 'RSN-001',
        description: 'Five songs recorded over one winter in a flat above a laundrette. Warm machines, cold windows. The first full-length release on ResonTune.',
        tracks: [
          { file: 'paper-lanterns', title: 'Paper Lanterns', no: 1, genres: ['indie-electronic'], tags: ['warm', 'late-night'], plays: 412,
            description: 'The title track. A slow-burning opener built on a swung dorian groove.',
            lyrics: 'Instrumental.\n\nWritten, produced and mixed by Marlow Ferris.' },
          { file: 'satellite-hearts', title: 'Satellite Hearts', no: 2, genres: ['indie-electronic'], tags: ['uplifting'], plays: 388,
            description: 'The fastest song on the record — written in one evening, kept exactly as it was.' },
          { file: 'vending-machine-light', title: 'Vending Machine Light', no: 3, genres: ['indie-electronic', 'downtempo'], tags: ['late-night', 'melancholic'], plays: 501,
            description: 'A lydian daydream about the glow at the end of the platform.' },
          { file: 'harbour-static', title: 'Harbour Static', no: 4, genres: ['indie-electronic'], tags: ['focus'], plays: 245 },
          { file: 'last-orders', title: 'Last Orders', no: 5, genres: ['indie-electronic', 'downtempo'], tags: ['warm', 'melancholic'], plays: 312,
            description: 'Closing time. Everything slows down and the plucked guitar patch finally gets the room to itself.' },
        ],
      },
      {
        slug: 'night-bus', title: 'Night Bus', type: 'single',
        released: '2026-02-20', art: '/artwork/single-night-bus.jpg', catalogNo: 'RSN-006',
        description: 'A standalone single. Faster, darker, and made for the top deck.',
        tracks: [
          { file: 'night-bus', title: 'Night Bus', no: 1, genres: ['indie-electronic'], tags: ['late-night', 'travel'], plays: 640,
            description: 'Written on the N1 between midnight and one.' },
        ],
      },
    ],
  },
  {
    slug: 'cascadia-loom',
    name: 'Cascadia Loom',
    location: 'Portland, OR',
    bio: 'Cascadia Loom is an ambient project built from long tones, slow chords, and the patience of moss. Albums are composed in single sittings and edited only for breath.',
    image: '/artwork/artist-cascadia.jpg',
    links: [
      { kind: 'bandcamp', label: 'Bandcamp', url: 'https://bandcamp.com' },
      { kind: 'patreon', label: 'Patreon', url: 'https://patreon.com' },
    ],
    albums: [
      {
        slug: 'understory', title: 'Understory', type: 'ep',
        released: '2026-01-09', art: '/artwork/album-understory.jpg', catalogNo: 'RSN-004',
        description: 'Three pieces for the hour before rain. Best listened to at low volume in a room with a window.',
        tracks: [
          { file: 'fern-language', title: 'Fern Language', no: 1, genres: ['ambient'], tags: ['organic', 'focus'], plays: 289,
            description: 'Lydian drones over a root that never quite resolves.' },
          { file: 'moss-cathedral', title: 'Moss Cathedral', no: 2, genres: ['ambient'], tags: ['organic'], plays: 342,
            description: 'The slowest piece on the EP. Organ tones stacked like canopy light.' },
          { file: 'rain-shadow', title: 'Rain Shadow', no: 3, genres: ['ambient', 'downtempo'], tags: ['rainy-day', 'melancholic'], plays: 270 },
        ],
      },
    ],
  },
  {
    slug: 'ratri-tidewater',
    name: 'Ratri & The Tidewater',
    location: 'Banjarmasin, Indonesia',
    bio: 'Ratri & The Tidewater blend river-market atmosphere, pentatonic guitar figures, and soft electronics into what they call "delta music" — songs from the city of a thousand rivers.',
    image: '/artwork/artist-ratri.jpg',
    links: [
      { kind: 'kofi', label: 'Ko-fi', url: 'https://ko-fi.com' },
      { kind: 'social', label: 'Instagram', url: 'https://instagram.com' },
    ],
    albums: [
      {
        slug: 'muara', title: 'Muara', type: 'ep',
        released: '2025-12-05', art: '/artwork/album-muara.jpg', catalogNo: 'RSN-002',
        description: 'Muara means estuary — the place where the river meets the sea and neither wins.',
        tracks: [
          { file: 'muara', title: 'Muara', no: 1, genres: ['folktronica'], tags: ['organic', 'warm'], plays: 455,
            description: 'Pentatonic plucks over a swung kick. The EP’s heart.',
            lyrics: 'Instrumental.\n\nComposed around the rhythm of the Martapura dawn market.' },
          { file: 'river-market', title: 'River Market', no: 2, genres: ['folktronica', 'indie-electronic'], tags: ['travel', 'uplifting'], plays: 380 },
          { file: 'tidewater-lullaby', title: 'Tidewater Lullaby', no: 3, genres: ['folktronica', 'ambient'], tags: ['warm', 'late-night'], plays: 298,
            description: 'For the boats that sleep tied together.' },
        ],
      },
    ],
  },
  {
    slug: 'vera-lune',
    name: 'Vera Lune',
    location: 'Montréal, QC',
    bio: 'Vera Lune makes downtempo for empty museums. Former cellist, current synthesist, permanent night person.',
    image: '/artwork/artist-vera.jpg',
    links: [
      { kind: 'bandcamp', label: 'Bandcamp', url: 'https://bandcamp.com' },
      { kind: 'website', label: 'veralune.example', url: 'https://example.com' },
    ],
    albums: [
      {
        slug: 'copper-veins', title: 'Copper Veins', type: 'single',
        released: '2026-03-01', art: '/artwork/single-copper-veins.jpg', catalogNo: 'RSN-007',
        description: 'A heavy, swung single about the wiring inside old buildings and old friendships.',
        tracks: [
          { file: 'copper-veins', title: 'Copper Veins', no: 1, genres: ['downtempo'], tags: ['melancholic', 'late-night'], plays: 520,
            description: 'The bass line came first. Everything else is scaffolding.' },
        ],
      },
      {
        slug: 'low-orbit', title: 'Low Orbit', type: 'single',
        released: '2025-10-17', art: '/artwork/single-low-orbit.jpg', catalogNo: 'RSN-003',
        description: 'Slow dorian gravity. Recorded in one take with the lights off.',
        tracks: [
          { file: 'low-orbit', title: 'Low Orbit', no: 1, genres: ['downtempo', 'ambient'], tags: ['late-night', 'focus'], plays: 433 },
        ],
      },
    ],
  },
  {
    slug: 'the-halfday-union',
    name: 'The Halfday Union',
    location: 'Melbourne, AU',
    bio: 'Four friends, two rehearsal rooms, one rule: every song must be finishable before lunch. Instrumental music for commutes, deadlines, and long walks that solve nothing.',
    image: '/artwork/artist-halfday.jpg',
    links: [
      { kind: 'bandcamp', label: 'Bandcamp', url: 'https://bandcamp.com' },
      { kind: 'social', label: 'Mastodon', url: 'https://joinmastodon.org' },
    ],
    albums: [
      {
        slug: 'commuter-hymns', title: 'Commuter Hymns', type: 'album',
        released: '2026-01-30', art: '/artwork/album-commuter-hymns.jpg', catalogNo: 'RSN-005',
        description: 'Nine-to-five music for people who are neither. Recorded live in the room.',
        tracks: [
          { file: 'platform-two', title: 'Platform Two', no: 1, genres: ['post-rock', 'instrumental'], tags: ['travel', 'uplifting'], plays: 366,
            description: 'The opener. 128 BPM of mixolydian optimism.' },
          { file: 'overpass-in-june', title: 'Overpass in June', no: 2, genres: ['post-rock', 'instrumental'], tags: ['warm', 'uplifting'], plays: 402 },
          { file: 'the-quiet-carriage', title: 'The Quiet Carriage', no: 3, genres: ['instrumental', 'ambient'], tags: ['focus', 'travel'], plays: 311,
            description: 'Please respect other passengers.' },
        ],
      },
    ],
  },
];

/* ═══════════════════════ Community catalog ═══════════════════════ */

const COMMUNITY: SeedArtist[] = [
  {
    slug: 'glasshouse-tapes',
    name: 'Glasshouse Tapes',
    location: 'Utrecht, NL',
    bio: 'Bedroom electronic recorded in a plant-filled apartment. Everything on cheap gear, everything with the window open. Publishes through the ResonTune community program.',
    image: '/artwork/artist-glasshouse.jpg',
    links: [
      { kind: 'bandcamp', label: 'Bandcamp', url: 'https://bandcamp.com' },
      { kind: 'kofi', label: 'Ko-fi', url: 'https://ko-fi.com' },
    ],
    albums: [
      {
        slug: 'winter-garden', title: 'Winter Garden', type: 'ep',
        released: '2026-04-11', art: '/artwork/album-winter-garden.jpg',
        description: 'Three rooms of the same greenhouse: cold glass, warm lamp, wet soil.',
        tracks: [
          { file: 'winter-garden', title: 'Winter Garden', no: 1, genres: ['bedroom-pop', 'downtempo'], tags: ['rainy-day', 'warm'], plays: 188,
            description: 'The lamp in the cold room.' },
          { file: 'condensation', title: 'Condensation', no: 2, genres: ['bedroom-pop', 'indie-electronic'], tags: ['late-night', 'melancholic'], plays: 154 },
          { file: 'orange-peel-sun', title: 'Orange Peel Sun', no: 3, genres: ['bedroom-pop'], tags: ['warm', 'uplifting'], plays: 201,
            description: 'For the twenty minutes of January sunlight.' },
        ],
      },
    ],
  },
  {
    slug: 'kite-season',
    name: 'Kite Season',
    location: 'Taipei, TW',
    bio: 'Bright, fast, melodic electronic — music for rooftops and second winds. A community artist publishing on ResonTune.',
    image: '/artwork/artist-kite.jpg',
    links: [
      { kind: 'website', label: 'kiteseason.example', url: 'https://example.com' },
      { kind: 'social', label: 'Instagram', url: 'https://instagram.com' },
    ],
    albums: [
      {
        slug: 'paper-planes', title: 'Paper Planes', type: 'single',
        released: '2026-05-02', art: '/artwork/single-paper-planes.jpg',
        description: 'Two-track single: one for the throw, one for the glide.',
        tracks: [
          { file: 'paper-planes', title: 'Paper Planes', no: 1, genres: ['chiptune-adjacent', 'indie-electronic'], tags: ['playful', 'uplifting'], plays: 244,
            description: '132 BPM of pentatonic optimism.' },
          { file: 'rooftop-arcade', title: 'Rooftop Arcade', no: 2, genres: ['chiptune-adjacent'], tags: ['playful', 'travel'], plays: 167 },
        ],
      },
    ],
  },
];

/* ═══════════════════════ Collections (editorial) ═══════════════════════ */

interface SeedCollection {
  slug: string;
  title: string;
  description: string;
  art: string;
  items: { kind: 'track' | 'album' | 'artist'; ref: string; note?: string }[]; // ref = track file | album slug | artist slug
}

const COLLECTIONS: SeedCollection[] = [
  {
    slug: 'resontune-essentials',
    title: 'ResonTune Essentials',
    description: 'Start here. One track from every corner of the catalog — the shortest possible introduction to what ResonTune sounds like.',
    art: '/artwork/collection-essentials.jpg',
    items: [
      { kind: 'track', ref: 'night-bus', note: 'The Originals catalog at full speed.' },
      { kind: 'track', ref: 'muara', note: 'Delta music. Nothing else on the platform sounds like this.' },
      { kind: 'track', ref: 'moss-cathedral', note: 'The quietest room in the building.' },
      { kind: 'track', ref: 'paper-planes', note: 'What the community program is for.' },
      { kind: 'album', ref: 'marlow-ferris-paper-lanterns', note: 'The first full-length ever released on ResonTune.' },
      { kind: 'artist', ref: 'ratri-tidewater' },
    ],
  },
  {
    slug: 'indonesian-independent',
    title: 'Indonesian Independent',
    description: 'A scene spotlight on the archipelago — starting from Banjarmasin, the city of a thousand rivers.',
    art: '/artwork/collection-indonesian.jpg',
    items: [
      { kind: 'artist', ref: 'ratri-tidewater', note: 'Founding artist of the delta sound.' },
      { kind: 'album', ref: 'ratri-tidewater-muara' },
      { kind: 'track', ref: 'river-market' },
      { kind: 'track', ref: 'tidewater-lullaby' },
    ],
  },
  {
    slug: 'late-night-desk',
    title: 'Late Night Desk',
    description: 'Focus music for the hours when the office is a lamp and a keyboard.',
    art: '/artwork/collection-latenight.jpg',
    items: [
      { kind: 'track', ref: 'vending-machine-light' },
      { kind: 'track', ref: 'low-orbit' },
      { kind: 'track', ref: 'fern-language' },
      { kind: 'track', ref: 'the-quiet-carriage' },
      { kind: 'track', ref: 'condensation' },
      { kind: 'track', ref: 'harbour-static' },
    ],
  },
  {
    slug: 'free-to-share',
    title: 'Free to Share',
    description: 'Every track here is published under a license that lets you share it onward. Check each track page for the exact terms.',
    art: '/artwork/collection-freetoshare.jpg',
    items: [
      { kind: 'track', ref: 'paper-lanterns' },
      { kind: 'track', ref: 'muara' },
      { kind: 'track', ref: 'platform-two' },
      { kind: 'track', ref: 'winter-garden' },
      { kind: 'track', ref: 'orange-peel-sun' },
    ],
  },
];

const CURATED_PLAYLISTS = [
  {
    slug: 'late-night-coding',
    title: 'Late Night Coding',
    description: 'Focus music, updated by the ResonTune editors.',
    tracks: ['vending-machine-light', 'harbour-static', 'low-orbit', 'fern-language', 'the-quiet-carriage', 'rain-shadow', 'condensation'],
  },
  {
    slug: 'indie-electronic-now',
    title: 'Indie Electronic, Now',
    description: 'The current shape of indie electronic on ResonTune.',
    tracks: ['night-bus', 'satellite-hearts', 'paper-lanterns', 'river-market', 'copper-veins', 'paper-planes'],
  },
  {
    slug: 'banjarmasin-indie',
    title: 'Banjarmasin Indie',
    description: 'Delta music and its neighbors — a scene spotlight.',
    tracks: ['muara', 'river-market', 'tidewater-lullaby', 'last-orders'],
  },
  {
    slug: '3am-discoveries',
    title: '3 AM Discoveries',
    description: 'Songs that sound better when the rest of the city is asleep.',
    tracks: ['low-orbit', 'moss-cathedral', 'tidewater-lullaby', 'vending-machine-light', 'copper-veins', 'winter-garden'],
  },
];

const COMMUNITY_PICKS: { file: string; note: string }[] = [
  { file: 'muara', note: 'The whole EP is great, but the title track is where the field-recording atmosphere and the guitar finally hold hands.' },
  { file: 'winter-garden', note: 'Proof the community program works. Quiet, confident, complete.' },
  { file: 'night-bus', note: 'Best opener-to-drop ratio in the catalog right now.' },
  { file: 'paper-planes', note: 'Pure serotonin. The glide section at the two-minute mark!' },
  { file: 'moss-cathedral', note: 'Put this on at low volume and watch your shoulders descend.' },
];

/* --------------------------------- seeding -------------------------------- */

export async function seedIfEmpty(): Promise<void> {
  const db = await getDb();
  const rows = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM tracks`);
  if (Number(rows[0]?.n ?? 0) > 0) return;
  console.log('[seed] empty catalog — seeding ResonTune launch catalog…');
  await seed();
}

async function seedArtistGroup(
  artists: SeedArtist[],
  sourceType: 'original' | 'community',
  trackIdByFile: Map<string, string>,
  durations: Record<string, number>,
): Promise<void> {
  const db = await getDb();
  const hostedSourceType = sourceType === 'original' ? 'original_hosted' : 'community_hosted';

  for (const artist of artists) {
    const artistId = uuid();
    await db.query(
      `INSERT INTO artists (id, slug, name, bio, image_url, location, source_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (slug) DO NOTHING`,
      [artistId, artist.slug, artist.name, artist.bio, artist.image, artist.location, sourceType],
    );
    const aid = (await db.query<{ id: string }>(`SELECT id FROM artists WHERE slug = $1`, [artist.slug]))[0].id;
    for (const link of artist.links) {
      await db.query(
        `INSERT INTO artist_links (id, artist_id, kind, label, url) VALUES ($1, $2, $3, $4, $5)`,
        [uuid(), aid, link.kind, link.label, link.url],
      );
    }
    for (const album of artist.albums) {
      const albumId = uuid();
      const albumSlug = `${artist.slug}-${album.slug}`;
      await db.query(
        `INSERT INTO albums (id, slug, artist_id, title, type, artwork_url, description, released_on, source_type, catalog_no)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (slug) DO NOTHING`,
        [albumId, albumSlug, aid, album.title, album.type, album.art, album.description, album.released, sourceType, album.catalogNo ?? null],
      );
      const alid = (await db.query<{ id: string }>(`SELECT id FROM albums WHERE slug = $1`, [albumSlug]))[0].id;
      for (const t of album.tracks) {
        const trackId = uuid();
        const slug = `${artist.slug}-${t.file}`;
        const rightsHolder = sourceType === 'original'
          ? `ResonTune Originals (fictional launch-catalog artist; audio composed & rendered by the ResonTune project, released CC0)`
          : `${artist.name} (fictional community-catalog artist; audio composed & rendered by the ResonTune project, released CC0)`;
        await db.query(
          `INSERT INTO tracks (id, slug, title, artist_id, album_id, track_no, duration_seconds,
                               artwork_url, description, license_id, rights_holder, credits, play_count,
                               source_type, attribution_text, distribution_permission, streaming_permission)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, true)
           ON CONFLICT (slug) DO NOTHING`,
          [trackId, slug, t.title, aid, alid, t.no ?? null, durations[t.file] ?? null,
           album.art, t.description ?? null, 'cc0-1.0', rightsHolder,
           `Written and produced by ${artist.name}.`, t.plays, sourceType,
           `${t.title} — ${artist.name} (via ResonTune)`],
        );
        const tid = (await db.query<{ id: string }>(`SELECT id FROM tracks WHERE slug = $1`, [slug]))[0].id;
        trackIdByFile.set(t.file, tid);
        await db.query(
          `INSERT INTO track_sources (id, track_id, provider, kind, url, mime_type, storage,
                                      source_type, object_key, duration_seconds)
           VALUES ($1, $2, 'hosted', 'direct_url', $3, 'audio/mpeg', 'object-key', $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [uuid(), tid, `/media/audio/${t.file}.mp3`, hostedSourceType, `${t.file}.mp3`, durations[t.file] ?? null],
        );
        for (const g of t.genres) {
          await db.query(`INSERT INTO track_genres (track_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [tid, g]);
        }
        for (const tag of t.tags) {
          await db.query(`INSERT INTO track_tags (track_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [tid, tag]);
        }
        if (t.lyrics) {
          await db.query(`INSERT INTO lyrics (track_id, body) VALUES ($1, $2) ON CONFLICT (track_id) DO NOTHING`, [tid, t.lyrics]);
        }
      }
    }
  }
}

export async function seed(): Promise<void> {
  const db = await getDb();

  let durations: Record<string, number> = {};
  const durPath = path.resolve(__dirname, '../../media/audio/durations.json');
  if (fs.existsSync(durPath)) durations = JSON.parse(fs.readFileSync(durPath, 'utf8'));

  for (const l of LICENSES) {
    await db.query(
      `INSERT INTO licenses (id, name, url, summary, requires_attribution)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [l.id, l.name, l.url, l.summary, l.attribution],
    );
  }
  for (const [id, name] of GENRES) {
    await db.query(`INSERT INTO genres (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, name]);
  }
  for (const [id, name] of TAGS) {
    await db.query(`INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, name]);
  }

  const trackIdByFile = new Map<string, string>();
  await seedArtistGroup(ORIGINALS, 'original', trackIdByFile, durations);
  await seedArtistGroup(COMMUNITY, 'community', trackIdByFile, durations);

  /* collections */
  for (const col of COLLECTIONS) {
    const cid = uuid();
    await db.query(
      `INSERT INTO collections (id, slug, title, description, artwork_url, curator_name, status)
       VALUES ($1, $2, $3, $4, $5, 'ResonTune Editorial', 'published')
       ON CONFLICT (slug) DO NOTHING`,
      [cid, col.slug, col.title, col.description, col.art],
    );
    const realCid = (await db.query<{ id: string }>(`SELECT id FROM collections WHERE slug = $1`, [col.slug]))[0].id;
    let pos = 0;
    for (const item of col.items) {
      let itemId: string | undefined;
      if (item.kind === 'track') itemId = trackIdByFile.get(item.ref);
      else if (item.kind === 'album') {
        itemId = (await db.query<{ id: string }>(`SELECT id FROM albums WHERE slug = $1`, [item.ref]))[0]?.id;
      } else {
        itemId = (await db.query<{ id: string }>(`SELECT id FROM artists WHERE slug = $1`, [item.ref]))[0]?.id;
      }
      if (!itemId) continue;
      await db.query(
        `INSERT INTO collection_items (collection_id, position, item_kind, item_id, note)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [realCid, pos++, item.kind, itemId, item.note ?? null],
      );
    }
  }

  /* curated playlists */
  for (const pl of CURATED_PLAYLISTS) {
    const pid = uuid();
    await db.query(
      `INSERT INTO playlists (id, slug, owner_id, title, description, is_public, is_curated, like_count)
       VALUES ($1, $2, NULL, $3, $4, true, true, $5) ON CONFLICT (slug) DO NOTHING`,
      [pid, pl.slug, pl.title, pl.description, Math.floor(20 + Math.random() * 60)],
    );
    const real = (await db.query<{ id: string }>(`SELECT id FROM playlists WHERE slug = $1`, [pl.slug]))[0].id;
    let pos = 0;
    for (const file of pl.tracks) {
      const tid = trackIdByFile.get(file);
      if (!tid) continue;
      await db.query(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [real, tid, pos++],
      );
    }
  }

  for (const pick of COMMUNITY_PICKS) {
    const tid = trackIdByFile.get(pick.file);
    if (!tid) continue;
    await db.query(
      `INSERT INTO community_picks (track_id, note) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tid, pick.note],
    );
  }

  console.log('[seed] launch catalog seeded (Originals + Community + Collections).');
}

/* Allow `npm run seed` */
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  migrate()
    .then(seed)
    .then(() => {
      console.log('done.');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
