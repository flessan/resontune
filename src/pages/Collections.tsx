/**
 * Collections index — the editorial layer. Collections can mix tracks,
 * releases and artists around a theme; they're curated, not generated.
 */
import { useFetch } from '@/lib/useFetch';
import type { Collection } from '@/lib/types';
import { CollectionTile } from '@/components/Tiles';

export default function Collections() {
  const { data, loading, error } = useFetch<{ collections: Collection[] }>('/collections');

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Couldn't load collections</h3><p>{error}</p></div></div>;

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 6 }}>
        <h1 className="section-title" style={{ fontSize: 30 }}>Collections</h1>
        <span className="section-note">themes, scenes and starting points, curated by people</span>
      </div>
      <div className="collection-grid">
        {data.collections.map((c) => <CollectionTile key={c.id} collection={c} />)}
      </div>
    </div>
  );
}
