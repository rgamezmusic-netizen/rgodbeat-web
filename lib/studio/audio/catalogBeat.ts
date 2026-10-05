const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve catalog identity from stored metadata, or the exact legacy Studio ID format. */
export function getCatalogBeatId(studioBeatId?: string | null, catalogBeatId?: string | null): string | null {
  if (catalogBeatId !== undefined) {
    return typeof catalogBeatId === 'string' && UUID.test(catalogBeatId) ? catalogBeatId : null;
  }
  const match = typeof studioBeatId === 'string' ? /^catalog-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(studioBeatId) : null;
  return match?.[1] ?? null;
}
