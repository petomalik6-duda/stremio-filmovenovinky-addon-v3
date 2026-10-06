export function sourceItemKey(item = {}) {
  return String(item.key || `${item.type}|${item.name}|${item.originalName || ''}|${item.year}|${item.lang}`).toLowerCase();
}

export function localStremioId(item = {}) {
  return `filmovenovinky:${Buffer.from(`${item.type}-${item.name}-${item.year}-${item.lang}`).toString('base64url')}`;
}

export function buildMetaIndex(metas = [], items = []) {
  const index = new Map();
  const itemByKey = new Map((items || []).map(item => [sourceItemKey(item), item]));

  for (const meta of metas || []) {
    if (!meta?.id) continue;
    index.set(meta.id, meta);

    // Always index known shared external identities as aliases too. This lets
    // serve-time public IDs switch from filmovenovinky: to tmdb:/tt immediately,
    // even when the persisted cache was generated before the identity change.
    const imdbId = meta?._addon?.imdbId;
    if (imdbId && /^tt\d+$/.test(String(imdbId))) index.set(String(imdbId), meta);

    const tmdbId = Number(meta?._addon?.tmdbId || 0);
    if (tmdbId > 0) index.set(`tmdb:${tmdbId}`, meta);

    const explicitLocalId = meta?._addon?.localId;
    if (explicitLocalId) index.set(explicitLocalId, meta);

    const key = String(meta?._addon?.key || '').toLowerCase();
    const sourceItem = key ? itemByKey.get(key) : null;
    if (sourceItem) index.set(localStremioId(sourceItem), meta);

    for (const alias of meta?._addon?.aliasIds || []) {
      if (alias) index.set(alias, meta);
    }
  }

  return index;
}
