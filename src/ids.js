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

    // Klient môže mať ešte v cache pôvodné lokálne ID z času, keď sa IMDb/TMDB
    // nepodarilo nájsť. Po neskoršom enrichmente sa ID zmení na tt..., ale starý
    // detail request musí stále fungovať.
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
