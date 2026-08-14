import { scrapeFilmovenovinky, itemKey } from './scrape.js';
import { fetchCsfdMeta, searchCsfd } from './csfd.js';
import { tmdbByImdb, tmdbSearch, tmdbMovie, tmdbSeries, getTmdbStatus } from './tmdb.js';
import { readStore, writeStore, storePath } from './store.js';
import { buildMetaIndex, localStremioId } from './ids.js';
import { preferRicherMeta, metaNeedsDetailRepair, metaDetailIssues } from './meta-quality.js';
import { getVerifiedSourceOverride, sourceOverrideNeedsMigration } from './source-overrides.js';

const MAX_ITEMS = Number(process.env.MAX_ITEMS || 1000);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_HOURS || 24) * 60 * 60 * 1000;
const REFRESH_NEW_ONLY = String(process.env.REFRESH_NEW_ONLY || 'true').toLowerCase() !== 'false';
const CSFD_SEARCH_FALLBACK = String(process.env.CSFD_SEARCH_FALLBACK || 'false').toLowerCase() === 'true';
const ENRICH_LIMIT = Number(process.env.ENRICH_LIMIT || 0);
const DETAIL_REPAIR_LIMIT = Number(process.env.DETAIL_REPAIR_LIMIT || 100);
const REFRESH_LOCK_TIMEOUT_MS = Number(process.env.REFRESH_LOCK_TIMEOUT_MS || 180000);
const HIDE_UNMATCHED_ITEMS = String(process.env.HIDE_UNMATCHED_ITEMS || 'false').toLowerCase() === 'true';
const STRICT_MOVIE_FILTER = String(process.env.STRICT_MOVIE_FILTER || 'true').toLowerCase() !== 'false';
const MATCH_VERSION = 3;
const CACHE_MATCH_YEAR_TOLERANCE = Number(process.env.CACHE_MATCH_YEAR_TOLERANCE || process.env.TMDB_YEAR_TOLERANCE || 2);

let cache = { at: 0, metas: [], byId: new Map(), items: [], sourceHash: '', lastError: null };
let running = null;
let runningStartedAt = 0;
let stage = 'idle';

function setStage(value) {
  stage = value;
  console.log('[refresh-stage]', value);
}

function stremioId(item, csfd, tmdb) { return tmdb?.imdbId || csfd?.imdbId || localStremioId(item); }
function score(meta) { const n = Number(meta.imdbRating || 0); return Number.isFinite(n) ? n : 0; }
function tmdbUrl(type, id) { return `https://www.themoviedb.org/${type === 'series' ? 'tv' : 'movie'}/${id}`; }
function placeholderPoster(name) { return `https://placehold.co/500x750?text=${encodeURIComponent(String(name || 'CZ/SK').slice(0, 35))}`; }

function localMeta(item) {
  return toMeta(item, {}, null);
}

function toMeta(item, csfd = {}, tmdb = null, extraAddon = {}) {
  const type = item.type === 'series' ? 'series' : 'movie';
  const id = stremioId(item, csfd, tmdb);
  const imdbId = tmdb?.imdbId || csfd?.imdbId || null;
  const displayName = item.name || tmdb?.name || 'Bez názvu';
  const links = [
    item.csfdUrl ? { name: 'ČSFD', category: 'Info', url: item.csfdUrl } : null,
    imdbId ? { name: 'IMDb', category: 'Info', url: `https://www.imdb.com/title/${imdbId}/` } : null,
    tmdb?.tmdbId ? { name: 'TMDB', category: 'Info', url: tmdbUrl(type, tmdb.tmdbId) } : null,
    tmdb?.trailer ? { name: 'Trailer', category: 'Video', url: `https://www.youtube.com/watch?v=${tmdb.trailer}` } : null,
    item.detailUrl ? { name: 'FilmovéNovinky', category: 'Info', url: item.detailUrl } : null,
    item.sourceUrl ? { name: 'Zdroj', category: 'Info', url: item.sourceUrl } : null
  ].filter(Boolean);

  const descriptionParts = [
    tmdb?.description || csfd.description || '',
    item.originalName ? `Originálny názov: ${item.originalName}` : null,
    `Dabing: ${item.lang || 'CZ/SK'}`,
    item.dateAdded ? `Pridané: ${item.dateAdded}` : null,
    item.csfdUrl ? `ČSFD: ${item.csfdUrl}` : null,
    imdbId ? `IMDb: ${imdbId}` : null,
    tmdb?.tmdbId ? `TMDB: ${tmdb.tmdbId}` : null
  ].filter(Boolean);

  return {
    id,
    type,
    name: displayName,
    poster: tmdb?.poster || csfd.poster || placeholderPoster(displayName),
    background: tmdb?.background || tmdb?.poster || csfd.poster || placeholderPoster(displayName),
    description: descriptionParts.join('\n\n'),
    // Rok zo zdroja FilmovéNovinky je pre katalóg autoritatívny. TMDB rok si
    // uchovávame iba diagnosticky, aby sa zmena distribučného roku neplietla s názvom.
    releaseInfo: item.year || tmdb?.releaseInfo || undefined,
    year: Number(item.year || tmdb?.releaseInfo) || undefined,
    runtime: tmdb?.runtime,
    genres: [...new Set([...(tmdb?.genres || []), ...(csfd.genres || []), item.lang].filter(Boolean))],
    imdbRating: tmdb?.imdbRating,
    director: tmdb?.director,
    cast: tmdb?.cast,
    links,
    behaviorHints: { defaultVideoId: id },
    // DÔLEŽITÉ: pri filme neposielame `videos` s trailerom. Nuvio/Android TV
    // môže každé samostatné video vyhodnotiť ako epizódu a film zobraziť ako seriál.
    // Trailer zostáva dostupný ako bežný odkaz vyššie.
    _addon: {
      key: item.key || itemKey(item),
      dateAdded: item.dateAdded,
      lang: item.lang,
      csfdUrl: item.csfdUrl || null,
      imdbId,
      tmdbId: tmdb?.tmdbId || null,
      tmdbYear: tmdb?.releaseInfo || null,
      matchVersion: MATCH_VERSION,
      sourceType: type,
      titleRaw: item.titleRaw,
      // Stabilný alias, aby detail fungoval aj po prechode local ID -> IMDb ID.
      localId: localStremioId(item),
      ...extraAddon
    }
  };
}

function titleCandidates(item, csfd = {}) {
  const values = [
    item.originalName,
    item.name,
    csfd.csfdTitle,
    item.titleRaw,
  ];

  const out = [];

  for (const value of values) {
    const clean = String(value || '')
      .replace(/^[-*•\s]+/g, '')
      .replace(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/ig, '')
      .replace(/\((19\d{2}|20\d{2})\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) continue;

    if (clean.includes('/')) {
      const parts = clean.split('/').map(x => x.trim()).filter(Boolean);
      for (const part of parts.reverse()) out.push(part);
    } else {
      out.push(clean);
    }
  }

  return [...new Set(out.filter(x => x.length >= 2))];
}

async function enrichItem(item, existing = null, { fastKnownLookup = true } = {}) {
  const verifiedOverride = getVerifiedSourceOverride(item);

  // Posledné overené edge cases viažeme na stabilné ČSFD ID. Tým sa vyhneme
  // agresívnejšiemu fuzzy matchingu pre celý katalóg.
  if (verifiedOverride?.excludedReason) {
    return toMeta(item, {}, null, {
      excludedReason: verifiedOverride.excludedReason,
      sourceOverrideVersion: verifiedOverride.version || 1
    });
  }

  if (verifiedOverride?.tmdbId) {
    try {
      const directTmdb = item.type === 'series'
        ? await tmdbSeries(verifiedOverride.tmdbId)
        : await tmdbMovie(verifiedOverride.tmdbId);
      if (directTmdb) {
        return toMeta(item, { imdbId: verifiedOverride.imdbId || directTmdb.imdbId || null }, directTmdb, {
          lookupPath: 'verified_csfd_tmdb_override',
          sourceOverrideVersion: verifiedOverride.version || 1
        });
      }
    } catch (error) {
      console.warn('[verified-override] TMDB lookup failed, using normal fallbacks:', item.name, error.message);
    }
  }
  // Fast incremental path: ak cache už pozná externé ID, najprv sa pokúsime
  // obnoviť detail priamo z TMDB. Tým sa pri bežnom dennom refreshe vyhneme
  // pomalému ČSFD/Jina requestu pre položky, ktoré už boli spoľahlivo spárované.
  // Ak rýchla cesta zlyhá, pokračujeme pôvodnými fallbackmi nižšie.
  if (fastKnownLookup) {
    const existingTmdbId = existing?._addon?.tmdbId;
    if (existingTmdbId) {
      try {
        const directTmdb = item.type === 'series'
          ? await tmdbSeries(existingTmdbId)
          : await tmdbMovie(existingTmdbId);
        if (directTmdb) return toMeta({ ...item, csfdUrl: item.csfdUrl }, {}, directTmdb, { lookupPath: 'tmdb_id_fast' });
      } catch (error) {
        console.warn('[incremental-fast] TMDB ID lookup failed, using fallbacks:', item.name, error.message);
      }
    }

    const existingImdbId = existing?._addon?.imdbId || (typeof existing?.id === 'string' && existing.id.startsWith('tt') ? existing.id : null);
    if (existingImdbId) {
      try {
        const directTmdb = await tmdbByImdb(existingImdbId, item.type);
        if (directTmdb) return toMeta({ ...item, csfdUrl: item.csfdUrl }, {}, directTmdb, { lookupPath: 'imdb_to_tmdb_fast' });
      } catch (error) {
        console.warn('[incremental-fast] IMDb -> TMDB lookup failed, using fallbacks:', item.name, error.message);
      }
    }
  }

  let csfdUrl = item.csfdUrl;

  if (item.type !== 'series' && !csfdUrl && CSFD_SEARCH_FALLBACK) {
    csfdUrl = await searchCsfd(item.originalName || item.name, item.year) || await searchCsfd(item.name, item.year);
  }

  const normalizedItem = { ...item, csfdUrl };
  let csfd = item.type === 'series' ? {} : await fetchCsfdMeta(csfdUrl);
  if (verifiedOverride) {
    csfd = {
      ...csfd,
      imdbId: csfd.imdbId || verifiedOverride.imdbId || null,
      description: csfd.description || verifiedOverride.description || '',
      genres: (Array.isArray(csfd.genres) && csfd.genres.length) ? csfd.genres : (verifiedOverride.genres || []),
    };
  }

  // Dôkladná fallback cesta. Pri full refreshe sa sem ide priamo, aby sa zachovalo
  // pôvodné overenie cez ČSFD/Jina + TMDB matcher.
  let tmdb = null;
  const existingTmdbId = existing?._addon?.tmdbId;
  if (existingTmdbId) {
    tmdb = item.type === 'series'
      ? await tmdbSeries(existingTmdbId)
      : await tmdbMovie(existingTmdbId);
  }

  const knownImdbId = existing?._addon?.imdbId || csfd.imdbId || null;
  if (!tmdb && knownImdbId) {
    tmdb = await tmdbByImdb(knownImdbId, item.type);
  }

  if (!tmdb) {
    for (const title of titleCandidates(item, csfd)) {
      tmdb = await tmdbSearch(title, item.year, item.type);
      if (tmdb) break;
    }
  }

  // Movie-only addon: ak filmové vyhľadávanie zlyhá, over presnú zhodu v TV.
  // Takto sa napr. dokumentárny seriál Tajemství včel nebude tváriť ako film.
  if (!tmdb && item.type === 'movie') {
    let detectedSeries = null;
    for (const title of titleCandidates(item, csfd)) {
      detectedSeries = await tmdbSearch(title, item.year, 'series');
      if (detectedSeries) break;
    }
    if (detectedSeries) {
      return toMeta(normalizedItem, csfd, null, {
        excludedReason: 'tmdb_detected_series',
        detectedType: 'series',
        detectedTmdbId: detectedSeries.tmdbId || null
      });
    }
  }

  return toMeta(normalizedItem, csfd, tmdb, verifiedOverride ? {
    sourceOverrideVersion: verifiedOverride.version || 1,
    lookupPath: tmdb ? 'verified_or_standard_match' : 'verified_csfd_fallback'
  } : {});
}

function metaNeedsRematch(item, meta) {
  if (!meta) return true;
  // Overené source corrections sa migráciou týkajú iba konkrétnych ČSFD ID.
  // Kontrola musí byť pred excludedReason, aby sa vedela aktualizovať aj staršia
  // vylúčená položka, ak sa override verzia zmení.
  if (sourceOverrideNeedsMigration(item, meta)) return true;
  if (meta?._addon?.excludedReason) return false;

  // Staršie cache vznikli pred opravou matcheru a musia sa postupne prepočítať.
  if (Number(meta._addon?.matchVersion || 0) < MATCH_VERSION) return true;

  // Film môže mať správne IMDb/TMDB ID a napriek tomu iba placeholder detail.
  // Taký záznam sa musí skúsiť obohatiť znova aj pri nezmenenom zdroji.
  if (metaNeedsDetailRepair(meta)) return true;

  // Lokálne placeholder metadata sa nesmú považovať za definitívne spárované.
  // Ak raz TMDB/ČSFD request zlyhal, ďalší refresh musí mať šancu film opraviť.
  const hasExternalMatch = Boolean(
    meta?._addon?.imdbId ||
    meta?._addon?.tmdbId ||
    (typeof meta?.id === 'string' && meta.id.startsWith('tt'))
  );
  if (!hasExternalMatch) return true;

  const sourceYear = Number(item?.year || 0);
  const matchedYear = Number(meta?._addon?.tmdbYear || meta?.releaseInfo || meta?.year || 0);
  if (sourceYear && matchedYear && Math.abs(sourceYear - matchedYear) > CACHE_MATCH_YEAR_TOLERANCE) return true;

  return false;
}

function cacheNeedsMatchMigration(current) {
  const itemsByKey = new Map((current.items || []).map(item => [item.key || itemKey(item), item]));
  return (current.metas || []).some(meta => {
    const key = meta?._addon?.key;
    const item = key ? itemsByKey.get(key) : null;
    return item ? metaNeedsRematch(item, meta) : Number(meta?._addon?.matchVersion || 0) < MATCH_VERSION;
  });
}

function pendingRematchCount(current) {
  const itemsByKey = new Map((current.items || []).map(item => [item.key || itemKey(item), item]));
  return (current.metas || []).filter(meta => {
    const key = meta?._addon?.key;
    const item = key ? itemsByKey.get(key) : null;
    return item ? metaNeedsRematch(item, meta) : Number(meta?._addon?.matchVersion || 0) < MATCH_VERSION;
  }).length;
}

async function loadFromDisk() {
  const store = await readStore();
  cache = { ...store, byId: buildMetaIndex(store.metas, store.items), lastError: cache.lastError || store.lastError || null };
  return cache;
}

function isStale() {
  return !cache.at || Date.now() - cache.at > CACHE_TTL_MS;
}

function runningExpired() {
  return running && runningStartedAt && Date.now() - runningStartedAt > REFRESH_LOCK_TIMEOUT_MS;
}

export function isRefreshRunning() {
  if (runningExpired()) {
    cache.lastError = `Refresh lock expired after ${REFRESH_LOCK_TIMEOUT_MS}ms at stage: ${stage}`;
    running = null;
    runningStartedAt = 0;
    setStage('expired');
    return false;
  }
  return Boolean(running);
}

export function refreshCacheBackground(options = {}) {
  if (isRefreshRunning()) return running;
  return refreshCache(options).catch(e => {
    cache.lastError = e.message;
    setStage('failed');
    console.error('Background refresh failed:', e);
    return cache.metas || [];
  });
}

export async function refreshCache({ forceFull = false } = {}) {
  if (isRefreshRunning()) return running;

  runningStartedAt = Date.now();

  running = (async () => {
    try {
      setStage('load-disk-cache');
      const current = cache.at ? cache : await loadFromDisk();

      setStage('scrape-filmovenovinky');
      const scraped = await scrapeFilmovenovinky(MAX_ITEMS);

      setStage(`scraped-${scraped.items.length}-items`);

      if (!scraped.items.length) {
        cache.lastError = 'Scraper returned 0 items. Check MOVIES_SOURCE_URL or website HTML.';
        await writeStore({ at: current.at || 0, sourceHash: current.sourceHash || '', items: current.items || [], metas: current.metas || [], lastError: cache.lastError });
        return current.metas || [];
      }

      if (!forceFull && current.sourceHash === scraped.sourceHash && current.metas.length && !cacheNeedsMatchMigration(current)) {
        setStage('source-unchanged');
        cache = { ...current, at: Date.now(), byId: buildMetaIndex(current.metas, current.items), lastError: null };
        await writeStore({ at: cache.at, sourceHash: cache.sourceHash, items: cache.items, metas: cache.metas, lastError: null });
        return cache.metas;
      }

      setStage('build-metadata');
      const oldByKey = new Map((current.metas || []).map(m => [m._addon?.key, m]).filter(([k]) => k));
      const metas = [];
      let enriched = 0;

      for (const item of scraped.items) {
        const key = item.key || itemKey(item);
        const existing = oldByKey.get(key);
        const reusable = !forceFull && REFRESH_NEW_ONLY && existing && !metaNeedsRematch(item, existing);

        if (reusable) {
          metas.push(existing);
          continue;
        }

        // ENRICH_LIMIT=0 znamená: žiadne CSFD/TMDB HTTP volania, iba rýchle lokálne metadata.
        if (ENRICH_LIMIT <= 0 || (!forceFull && enriched >= ENRICH_LIMIT)) {
          // Ak sme dosiahli limit, neničíme staré metadata. Neoverené staršie záznamy
          // sa prepočítajú v ďalšom refreshe; nové položky dostanú bezpečné lokálne meta.
          metas.push(existing || localMeta(item));
          continue;
        }

        try {
          const candidate = await enrichItem(item, existing, { fastKnownLookup: !forceFull });
          metas.push(preferRicherMeta(existing, candidate));
          enriched += 1;
        } catch (e) {
          console.error('Enrich failed:', item.name, e.message);
          // Critical: even forceFull refresh must not destroy a previously
          // enriched record when an external provider fails temporarily.
          metas.push(existing || localMeta(item));
        }
      }

      setStage('write-cache');
      cache = { at: Date.now(), sourceHash: scraped.sourceHash, items: scraped.items, metas, byId: buildMetaIndex(metas, scraped.items), lastError: null };
      await writeStore({ at: cache.at, sourceHash: cache.sourceHash, items: cache.items, metas: cache.metas, lastError: null });

      setStage('done');
      return metas;
    } catch (e) {
      cache.lastError = e.message;
      setStage('failed');
      await writeStore({ at: cache.at || 0, sourceHash: cache.sourceHash || '', items: cache.items || [], metas: cache.metas || [], lastError: e.message }).catch(() => {});
      throw e;
    }
  })();

  try {
    return await running;
  } finally {
    running = null;
    runningStartedAt = 0;
  }
}


export async function repairIncompleteMetadata({ limit = DETAIL_REPAIR_LIMIT } = {}) {
  if (!cache.at) await loadFromDisk();

  const tmdbStatus = getTmdbStatus();
  const itemsByKey = new Map((cache.items || []).map(item => [item.key || itemKey(item), item]));
  const metas = [...(cache.metas || [])];
  const targets = metas
    .map((meta, index) => ({ meta, index }))
    .filter(({ meta }) => !meta?._addon?.excludedReason && metaNeedsDetailRepair(meta))
    .slice(0, Math.max(0, Number(limit) || 0));

  const result = {
    ok: true,
    limit: Math.max(0, Number(limit) || 0),
    scanned: metas.length,
    targets: targets.length,
    repaired: 0,
    unresolved: 0,
    failed: 0,
    tmdbEnabled: tmdbStatus.enabled,
    tmdbConfigured: tmdbStatus.configured,
    unresolvedExamples: []
  };

  for (const { meta, index } of targets) {
    const key = meta?._addon?.key;
    const item = key ? itemsByKey.get(key) : null;

    if (!item) {
      result.unresolved += 1;
      if (result.unresolvedExamples.length < 20) {
        result.unresolvedExamples.push({ name: meta?.name || null, reason: 'source_item_missing' });
      }
      continue;
    }

    try {
      const candidate = await enrichItem(item, meta);
      const selected = preferRicherMeta(meta, candidate);
      metas[index] = selected;

      if (!metaNeedsDetailRepair(selected)) {
        result.repaired += 1;
      } else {
        result.unresolved += 1;
        if (result.unresolvedExamples.length < 20) {
          result.unresolvedExamples.push({
            name: meta?.name || item?.name || null,
            imdbId: meta?._addon?.imdbId || null,
            tmdbId: meta?._addon?.tmdbId || null,
            reason: (!tmdbStatus.enabled || !tmdbStatus.configured) ? 'tmdb_not_configured' : 'provider_returned_incomplete_metadata'
          });
        }
      }
    } catch (error) {
      metas[index] = meta;
      result.failed += 1;
      if (result.unresolvedExamples.length < 20) {
        result.unresolvedExamples.push({
          name: meta?.name || item?.name || null,
          imdbId: meta?._addon?.imdbId || null,
          tmdbId: meta?._addon?.tmdbId || null,
          reason: error.message
        });
      }
    }
  }

  cache = { ...cache, at: Date.now(), metas, byId: buildMetaIndex(metas, cache.items), lastError: null };
  await writeStore({ at: cache.at, sourceHash: cache.sourceHash, items: cache.items, metas: cache.metas, lastError: null });
  return result;
}

export async function getCatalog() {
  if (!cache.at) await loadFromDisk();

  if ((isStale() || cacheNeedsMatchMigration(cache)) && !isRefreshRunning()) {
    refreshCacheBackground().catch(() => {});
  }

  return cache.metas || [];
}

export async function getMetaById(id) {
  if (!cache.at) await loadFromDisk();
  return cache.byId.get(id) || null;
}

export async function getCatalogStats() {
  if (!cache.at) await loadFromDisk();
  const metas = cache.metas || [];

  return {
    at: cache.at,
    generatedAt: cache.at ? new Date(cache.at).toISOString() : null,
    stale: isStale(),
    refreshRunning: isRefreshRunning(),
    refreshStartedAt: runningStartedAt ? new Date(runningStartedAt).toISOString() : null,
    refreshAgeSeconds: runningStartedAt ? Math.round((Date.now() - runningStartedAt) / 1000) : 0,
    stage,
    lastError: cache.lastError,
    items: metas.length,
    visibleItems: HIDE_UNMATCHED_ITEMS
      ? metas.filter(looksLikeRealMovieMeta).filter(m => Boolean(m._addon?.tmdbId) || Boolean(m._addon?.imdbId) || Boolean(m._addon?.csfdUrl) || (typeof m.id === 'string' && m.id.startsWith('tt'))).length
      : metas.filter(looksLikeRealMovieMeta).length,
    hideUnmatchedItems: HIDE_UNMATCHED_ITEMS,
    matchVersion: MATCH_VERSION,
    tmdbEnabled: getTmdbStatus().enabled,
    tmdbConfigured: getTmdbStatus().configured,
    tmdbLanguage: getTmdbStatus().language,
    tmdbFallbackLanguage: getTmdbStatus().fallbackLanguage,
    tmdbTranslationFallback: getTmdbStatus().translationFallback,
    tmdbFactualSummaryFallback: getTmdbStatus().factualSummaryFallback,
    enrichLimit: ENRICH_LIMIT,
    detailRepairLimit: DETAIL_REPAIR_LIMIT,
    fastIncrementalKnownIdFirst: true,
    pendingRematch: pendingRematchCount(cache),
    cacheFile: storePath(),
    movies: metas.filter(m => m.type === 'movie').length,
    series: metas.filter(m => m.type === 'series').length,
    cz: metas.filter(m => m._addon?.lang === 'CZ').length,
    sk: metas.filter(m => m._addon?.lang === 'SK').length,
    czsk: metas.filter(m => m._addon?.lang === 'CZ/SK').length,
    withCsfd: metas.filter(m => m._addon?.csfdUrl).length,
    withImdb: metas.filter(m => m._addon?.imdbId).length,
    withTmdb: metas.filter(m => m._addon?.tmdbId).length,
    localIds: metas.filter(m => typeof m.id === 'string' && m.id.startsWith('filmovenovinky:')).length,
    excludedNonMovies: metas.filter(m => Boolean(m?._addon?.excludedReason)).length,
    poorMetadata: metas.filter(m => !m?._addon?.excludedReason && metaNeedsDetailRepair(m)).length,
    poorMissingPoster: metas.filter(m => !m?._addon?.excludedReason && metaDetailIssues(m).includes('poster')).length,
    poorMissingBackground: metas.filter(m => !m?._addon?.excludedReason && metaDetailIssues(m).includes('background')).length,
    poorMissingDescription: metas.filter(m => !m?._addon?.excludedReason && metaDetailIssues(m).includes('description')).length,
    richMetadata: metas.filter(m => !m?._addon?.excludedReason && !metaNeedsDetailRepair(m)).length,
    poorMetadataExamples: metas
      .filter(m => !m?._addon?.excludedReason && metaNeedsDetailRepair(m))
      .slice(0, 20)
      .map(m => ({
        name: m.name,
        year: m.releaseInfo || null,
        imdbId: m?._addon?.imdbId || null,
        tmdbId: m?._addon?.tmdbId || null,
        issues: metaDetailIssues(m)
      })),
    excludedExamples: metas
      .filter(m => Boolean(m?._addon?.excludedReason))
      .slice(0, 20)
      .map(m => ({ name: m.name, year: m.releaseInfo || null, reason: m._addon.excludedReason, detectedTmdbId: m._addon.detectedTmdbId || null }))
  };
}

export function searchCatalog(metas, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return metas;
  return metas.filter(m => `${m.name} ${m.description || ''} ${(m.genres || []).join(' ')} ${m._addon?.titleRaw || ''}`.toLowerCase().includes(q));
}


function looksLikeRealMovieMeta(meta) {
  if (meta?._addon?.excludedReason) return false;
  if (!STRICT_MOVIE_FILTER) return true;

  const name = String(meta.name || '').trim();
  if (!name || name.length < 2 || name.length > 120) return false;

  const raw = String(meta._addon?.titleRaw || meta.description || name);
  const hasYear = Boolean(meta.year || meta.releaseInfo || /\b(19\d{2}|20\d{2})\b/.test(raw));
  const hasExternal = Boolean(meta._addon?.tmdbId || meta._addon?.imdbId || meta._addon?.csfdUrl || (typeof meta.id === 'string' && meta.id.startsWith('tt')));

  const bad = /cookie|reklama|menu|kontakt|newsletter|facebook|instagram|youtube|filmovenovinky\.sk|nové filmy s dabingom|tipy na dobrý film|seriály|streamovacie služby/i;
  if (bad.test(name) || bad.test(raw)) return false;

  // Ak nemá externé ID, musí mať aspoň rok. Tým sa odstránia textové položky zo stránky.
  if (!hasExternal && !hasYear) return false;

  return true;
}

export function filterCatalog(metas, id, type) {
  let arr = [...metas].filter(m => m.type === 'movie').filter(looksLikeRealMovieMeta);

  if (id !== 'filmovenovinky-filmy') return [];

  if (HIDE_UNMATCHED_ITEMS) {
    arr = arr.filter(m =>
      Boolean(m._addon?.tmdbId) ||
      Boolean(m._addon?.imdbId) ||
      Boolean(m._addon?.csfdUrl) ||
      (typeof m.id === 'string' && m.id.startsWith('tt'))
    );
  }

  return arr.sort((a, b) => String(b._addon?.dateAdded || '').localeCompare(String(a._addon?.dateAdded || '')));
}
