import { localStremioId } from './ids.js';

export function publicLocalId(meta) {
  if (!meta) return null;

  if (meta?._addon?.localId) return meta._addon.localId;

  return localStremioId({
    type: meta.type === 'series' ? 'series' : 'movie',
    name: meta.name || 'Bez názvu',
    year: meta.year || meta.releaseInfo || '',
    lang: meta?._addon?.lang || 'CZ/SK'
  });
}

export function cleanPublicMeta(meta) {
  if (!meta) return null;

  const addon = meta._addon || {};
  const originalId = meta.id;
  const { _addon, ...safeMeta } = meta;

  if (safeMeta.type === 'movie') {
    delete safeMeta.videos;
    delete safeMeta.seriesInfo;
    delete safeMeta.season;
    delete safeMeta.episode;

    // Metadata používajú vlastné ID addonu, aby klient nepresmeroval detail
    // na Cinemeta/iný globálny IMDb provider. Stream ID však ostáva IMDb,
    // takže stream addony s idPrefixes:["tt"] fungujú ďalej.
    const localId = publicLocalId(meta);
    const videoId = addon.imdbId ||
      (typeof originalId === 'string' && originalId.startsWith('tt') ? originalId : localId);

    safeMeta.id = localId;
    safeMeta.behaviorHints = {
      ...(safeMeta.behaviorHints || {}),
      defaultVideoId: videoId
    };
  }

  return safeMeta;
}
