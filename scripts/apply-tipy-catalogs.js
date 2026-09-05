import fs from 'fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }
function mustReplace(content, file, search, replacement) {
  if (!content.includes(search)) throw new Error(`${file}: marker not found: ${search.slice(0, 80)}`);
  return content.replace(search, replacement);
}
function mustReplaceRegex(content, file, regex, replacement) {
  if (!regex.test(content)) throw new Error(`${file}: regex marker not found: ${regex}`);
  return content.replace(regex, replacement);
}
function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function patchPackage() {
  const file = 'package.json';
  const pkg = JSON.parse(read(file));
  pkg.version = '3.7.8';
  pkg.description = 'FilmoveNovinky movie-only addon with CZ/SK latest movies, tip catalogs, metadata overrides, debug diagnostics and strict Stremio/Nuvio/Fusion metadata normalization.';
  write(file, JSON.stringify(pkg, null, 2) + '\n');
}

function patchServer() {
  const file = 'server.js';
  let src = read(file);

  const catalogs = `const catalogs = [
  {
    type: 'movie',
    id: 'filmovenovinky-filmy',
    name: 'FilmovéNovinky – CZ/SK filmy',
    extra: [
      { name: 'skip', isRequired: false },
      { name: 'search', isRequired: false }
    ]
  },
  {
    type: 'movie',
    id: 'filmovenovinky-tipy',
    name: 'FilmovéNovinky – Tipy na film',
    extra: [
      { name: 'skip', isRequired: false },
      { name: 'search', isRequired: false }
    ]
  },
  {
    type: 'movie',
    id: 'filmovenovinky-najlepsie',
    name: 'FilmovéNovinky – Najlepšie hodnotené',
    extra: [
      { name: 'skip', isRequired: false },
      { name: 'search', isRequired: false }
    ]
  }
];`;

  src = mustReplaceRegex(src, file, /const catalogs = \[[\s\S]*?\n\];\n\nconst manifest =/, `${catalogs}\n\nconst manifest =`);
  src = src.replace("const ADDON_VERSION = process.env.npm_package_version || '3.7.7';", "const ADDON_VERSION = process.env.npm_package_version || '3.7.8';");
  src = src.replace(
    "        <p>Debug find: <a href=\"/debug/find?q=carodejnik\">/debug/find?q=carodejnik</a></p>",
    "        <p>Katalógy: CZ/SK filmy, Tipy na film, Najlepšie hodnotené</p>\n        <p>Debug find: <a href=\"/debug/find?q=carodejnik\">/debug/find?q=carodejnik</a></p>"
  );
  write(file, src);
}

function patchScrape() {
  const file = 'src/scrape.js';
  let src = read(file);

  src = src.replace(
    "export const SERIES_SOURCE_URL = process.env.SERIES_SOURCE_URL || '';\nconst DISABLE_SERIES",
    "export const SERIES_SOURCE_URL = process.env.SERIES_SOURCE_URL || '';\nexport const TIPS_SOURCE_URL = process.env.TIPS_SOURCE_URL || 'https://www.filmovenovinky.sk/top-filmy/tipy-na-dobry-film-a-serial-s-dabingom-aj-s-titulkami';\nconst ENABLE_TIPS_CATALOG = String(process.env.ENABLE_TIPS_CATALOG || 'true').toLowerCase() !== 'false';\nconst TIPS_MAX_ITEMS = Number(process.env.TIPS_MAX_ITEMS || 250);\nconst DISABLE_SERIES"
  );

  const helperMarker = 'function isProbablyNotMovieLine(text) {';
  if (!src.includes('function parseTipRatings(text)')) {
    const helpers = `
function parseNumber(value) {
  if (!value || /n\/?a/i.test(String(value))) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseTipRatings(text) {
  const t = clean(text);
  const imdbMatch = t.match(/IMDb\s*(N\/?A|[0-9]+(?:[,.][0-9]+)?)\s*\/\s*10/i);
  const csfdMatch = t.match(/ČSFD\s*([0-9]{1,3})\s*%/i);
  const availabilityMatch = t.match(/\b(CZ\/SK|SK\/CZ|CZ|SK|Tit|Titulky)\b/i);
  const availability = availabilityMatch?.[1] || null;
  const lang = availability
    ? availability.toUpperCase().replace('SK/CZ', 'CZ/SK').replace('TITULKY', 'TIT').replace('TIT', 'TIT')
    : 'CZ/SK';
  const isSeries = /\bTV\s*seri[aá]l\b/i.test(t);
  const genre = clean(t
    .replace(/\bTV\s*seri[aá]l\b/ig, '')
    .replace(/IMDb[\s\S]*$/i, '')
    .replace(/ČSFD[\s\S]*$/i, '')
  ) || null;

  return {
    imdbRating: parseNumber(imdbMatch?.[1]),
    csfdPercent: parseNumber(csfdMatch?.[1]),
    lang,
    genre,
    availability,
    isSeries
  };
}

function collectFollowingTipInfo($, el) {
  const parts = [];
  let node = $(el).next();
  let guard = 0;

  while (node.length && guard < 8) {
    guard += 1;
    const tag = node.get(0)?.tagName?.toLowerCase() || '';
    if (/^h[1-4]$/.test(tag)) break;

    const text = clean(node.text());
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)) break;
    if (text) parts.push(text);
    if (/IMDb|ČSFD/i.test(text)) break;

    node = node.next();
  }

  return clean(parts.join(' '));
}

function createTipItem(title, ratingText, currentDate, { links = [], detailUrl = null, csfdUrl = null } = {}) {
  const cleanTitleText = clean(String(title || '').replace(/^#+\s*/, ''));
  if (!cleanTitleText || !/\((19\d{2}|20\d{2})\)/.test(cleanTitleText)) return null;

  const ratings = parseTipRatings(ratingText);
  if (ratings.isSeries) return null;

  // Tipy môžu byť aj iba s titulkami. Shape parser potrebuje CZ/SK značku,
  // ale pôvodnú dostupnosť zachováme v item.lang a tipAvailability.
  const parseLang = ratings.lang === 'TIT' ? 'CZ' : (ratings.lang || 'CZ/SK');
  const item = makeMovieItemFromText(`${cleanTitleText} (${parseLang})`, currentDate, TIPS_SOURCE_URL, 'movie');
  if (!item) return null;

  item.titleRaw = clean(`${cleanTitleText} ${ratingText || ''}`);
  item.lang = ratings.lang || item.lang;
  item.dateAdded = currentDate || parseDate(cleanTitleText) || today();
  item.sourceUrl = TIPS_SOURCE_URL;
  item.sourcePage = 'tips';
  item.catalogIds = ['filmovenovinky-tipy'];
  item.detailUrl = detailUrl;
  item.csfdUrl = csfdUrl;
  item.links = uniqueStrings(links);
  item.tipGenre = ratings.genre;
  item.tipImdbRating = ratings.imdbRating;
  item.tipCsfdPercent = ratings.csfdPercent;
  item.tipAvailability = ratings.availability || ratings.lang || null;
  item.key = itemKey(item);
  return item;
}

function parseTipsTextList(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => clean(line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')))
    .filter(Boolean);

  const items = [];
  let currentDate = null;
  let pendingTitle = null;

  for (const line of lines) {
    const date = parseDate(line);
    if (date && line.length < 80) {
      currentDate = date;
      pendingTitle = null;
      continue;
    }

    const titleLine = clean(line.replace(/^#+\s*/, ''));
    if (/\((19\d{2}|20\d{2})\)/.test(titleLine) && !/IMDb|ČSFD/i.test(titleLine)) {
      pendingTitle = titleLine;
      continue;
    }

    if (pendingTitle && /IMDb|ČSFD/i.test(line)) {
      const item = createTipItem(pendingTitle, line, currentDate);
      if (item) items.push(item);
      pendingTitle = null;
    }
  }

  return unique(items).slice(0, TIPS_MAX_ITEMS).map((x, i) => ({ ...x, order: i }));
}

`;
    src = mustReplace(src, file, helperMarker, helpers + helperMarker);
  }

  if (!src.includes('export async function scrapeTips')) {
    const tipsFunction = `
export async function scrapeTips(maxItems = TIPS_MAX_ITEMS) {
  const { data, mode } = await fetchPage(TIPS_SOURCE_URL);
  const raw = String(data || '');
  let items = [];

  if (mode === 'reader' || !/<html|<body|<h3|<article/i.test(raw)) {
    items = parseTipsTextList(raw).slice(0, maxItems);
  } else {
    const $ = cheerio.load(raw);
    let currentDate = null;

    $('h1, h2, h3, h4, p, li').each((_i, el) => {
      const tag = el.tagName?.toLowerCase();
      const text = clean($(el).text());
      const date = parseDate(text);
      if (date && text.length < 80) {
        currentDate = date;
        return;
      }

      if (!/^h[3-4]$/.test(tag || '')) return;
      if (!/\((19\d{2}|20\d{2})\)/.test(text)) return;

      const ratingText = collectFollowingTipInfo($, el);
      if (!/IMDb|ČSFD/i.test(ratingText)) return;

      const links = extractLinks($, el, TIPS_SOURCE_URL);
      const siblingLinks = $(el).nextUntil('h1,h2,h3,h4').find('a')
        .map((_j, a) => absUrl($(a).attr('href'), TIPS_SOURCE_URL)).get().filter(Boolean);
      const allLinks = uniqueStrings([...links, ...siblingLinks]);
      const csfdUrl = allLinks.find(isCsfdUrl) || null;
      const detailUrl = allLinks.find(href => /(^|\.)filmovenovinky\.sk$/i.test(safeHost(href)) && href !== TIPS_SOURCE_URL) || null;
      const item = createTipItem(text, ratingText, currentDate, { links: allLinks, detailUrl, csfdUrl });
      if (item) items.push(item);
    });

    if (!items.length) items = parseTipsTextList($.text()).slice(0, maxItems);
  }

  items = unique(items).slice(0, maxItems).map((x, i) => ({ ...x, type: 'movie', order: i }));
  const sourceHash = crypto.createHash('sha1').update(items.map(i => i.key).join('|') || raw).digest('hex');
  console.log('[scrape] tips items=', items.length, 'mode=', mode);
  return { sourceUrl: TIPS_SOURCE_URL, sourceHash, items };
}

`;
    src = mustReplace(src, file, 'export async function scrapeSeries(maxItems = 40) {', tipsFunction + 'export async function scrapeSeries(maxItems = 40) {');
  }

  if (!src.includes('function mergeCatalogItems(items)')) {
    const mergeFunction = `
function mergeCatalogItems(items) {
  const byKey = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const key = `${item.type}|${item.name}|${item.originalName || ''}|${item.year}`.toLowerCase();
    const existing = byKey.get(key);

    if (!existing) {
      const catalogIds = item.catalogIds || ['filmovenovinky-filmy'];
      byKey.set(key, { ...item, catalogIds: uniqueStrings(catalogIds) });
      continue;
    }

    existing.catalogIds = uniqueStrings([...(existing.catalogIds || ['filmovenovinky-filmy']), ...(item.catalogIds || ['filmovenovinky-filmy'])]);
    existing.links = uniqueStrings([...(existing.links || []), ...(item.links || [])]);
    existing.detailUrl = existing.detailUrl || item.detailUrl || null;
    existing.csfdUrl = existing.csfdUrl || item.csfdUrl || null;
    existing.imdbId = existing.imdbId || item.imdbId || null;
    existing.tmdbId = existing.tmdbId || item.tmdbId || null;
    existing.tipGenre = existing.tipGenre || item.tipGenre || null;
    existing.tipImdbRating = existing.tipImdbRating ?? item.tipImdbRating ?? null;
    existing.tipCsfdPercent = existing.tipCsfdPercent ?? item.tipCsfdPercent ?? null;
    existing.tipAvailability = existing.tipAvailability || item.tipAvailability || null;
    existing.sourcePage = existing.sourcePage === 'tips' ? existing.sourcePage : (item.sourcePage || existing.sourcePage || null);
    existing.titleRaw = existing.titleRaw || item.titleRaw;
    existing.key = itemKey(existing);
  }

  return [...byKey.values()].map((item, index) => ({ ...item, order: index, key: itemKey(item) }));
}

`;
    src = mustReplace(src, file, 'export async function scrapeFilmovenovinky(maxItems = 1000) {', mergeFunction + 'export async function scrapeFilmovenovinky(maxItems = 1000) {');
  }

  const start = src.indexOf('export async function scrapeFilmovenovinky(maxItems = 1000) {');
  if (start === -1) throw new Error('src/scrape.js: scrapeFilmovenovinky start not found');
  src = src.slice(0, start) + `export async function scrapeFilmovenovinky(maxItems = 1000) {
  const moviesResult = await scrapeMovies(maxItems);

  let tipsResult = { sourceHash: '', items: [] };
  if (ENABLE_TIPS_CATALOG) {
    try {
      tipsResult = await scrapeTips(TIPS_MAX_ITEMS);
    } catch (e) {
      console.error('Tips scrape failed:', e.message);
    }
  } else {
    console.log('[scrape] tips catalog disabled');
  }

  let seriesResult = { sourceHash: '', items: [] };
  if (!DISABLE_SERIES && Number(process.env.MAX_SERIES || 0) > 0 && SERIES_SOURCE_URL) {
    try {
      seriesResult = await scrapeSeries(Number(process.env.MAX_SERIES || 0));
    } catch (e) {
      console.error('Series scrape failed:', e.message);
    }
  } else {
    console.log('[scrape] series disabled');
  }

  const sourceHash = crypto.createHash('sha1').update(`${moviesResult.sourceHash}|${tipsResult.sourceHash}|${seriesResult.sourceHash}`).digest('hex');
  const items = mergeCatalogItems([...moviesResult.items, ...tipsResult.items, ...seriesResult.items]);
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items };
}
`;

  write(file, src);
}

function patchCatalog() {
  const file = 'src/catalog.js';
  let src = read(file);

  src = src.replace('const MATCH_VERSION = 4;', 'const MATCH_VERSION = 5;');
  if (!src.includes('const BEST_IMDB_MIN')) {
    src = src.replace(
      'const CACHE_MATCH_YEAR_TOLERANCE = Number(process.env.CACHE_MATCH_YEAR_TOLERANCE || process.env.TMDB_YEAR_TOLERANCE || 2);',
      `const CACHE_MATCH_YEAR_TOLERANCE = Number(process.env.CACHE_MATCH_YEAR_TOLERANCE || process.env.TMDB_YEAR_TOLERANCE || 2);\nconst BEST_IMDB_MIN = Number(process.env.BEST_IMDB_MIN || 6.5);\nconst BEST_CSFD_MIN = Number(process.env.BEST_CSFD_MIN || 65);`
    );
  }

  src = src.replace('imdbRating: tmdb?.imdbRating,', 'imdbRating: tmdb?.imdbRating || item.tipImdbRating,');
  src = src.replace(
    'genres: [...new Set([...(tmdb?.genres || []), ...(csfd.genres || []), item.lang].filter(Boolean))],',
    'genres: [...new Set([...(tmdb?.genres || []), ...(csfd.genres || []), item.tipGenre, item.lang].filter(Boolean))],'
  );

  if (!src.includes('catalogIds: Array.isArray(item.catalogIds)')) {
    src = src.replace(
      '      lang: item.lang,\n      csfdUrl: item.csfdUrl || null,',
      `      lang: item.lang,\n      catalogIds: Array.isArray(item.catalogIds) && item.catalogIds.length ? item.catalogIds : ['filmovenovinky-filmy'],\n      sourcePage: item.sourcePage || null,\n      tipGenre: item.tipGenre || null,\n      tipImdbRating: item.tipImdbRating ?? null,\n      tipCsfdPercent: item.tipCsfdPercent ?? null,\n      tipAvailability: item.tipAvailability || null,\n      csfdUrl: item.csfdUrl || null,`
    );
  }

  if (!src.includes('function sortedCatalogIds(value)')) {
    src = src.replace(
      'function metaNeedsRematch(item, meta) {',
      `function sortedCatalogIds(value) {\n  const ids = Array.isArray(value) && value.length ? value : ['filmovenovinky-filmy'];\n  return [...new Set(ids.filter(Boolean))].sort();\n}\n\nfunction metaNeedsRematch(item, meta) {`
    );
  }

  if (!src.includes('const itemCatalogIds = sortedCatalogIds(item?.catalogIds);')) {
    src = src.replace(
      '  if (item?.tmdbId && Number(meta?._addon?.tmdbId || 0) !== Number(item.tmdbId)) return true;\n',
      `  if (item?.tmdbId && Number(meta?._addon?.tmdbId || 0) !== Number(item.tmdbId)) return true;\n\n  const itemCatalogIds = sortedCatalogIds(item?.catalogIds);\n  const metaCatalogIds = sortedCatalogIds(meta?._addon?.catalogIds);\n  if (itemCatalogIds.join('|') !== metaCatalogIds.join('|')) return true;\n  if ((item?.tipImdbRating ?? null) !== (meta?._addon?.tipImdbRating ?? null)) return true;\n  if ((item?.tipCsfdPercent ?? null) !== (meta?._addon?.tipCsfdPercent ?? null)) return true;\n`
    );
  }

  const newFilter = `
function catalogIdsForMeta(meta) {
  return Array.isArray(meta?._addon?.catalogIds) && meta._addon.catalogIds.length
    ? meta._addon.catalogIds
    : ['filmovenovinky-filmy'];
}

function hasCatalog(meta, catalogId) {
  return catalogIdsForMeta(meta).includes(catalogId);
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isBestRatedTip(meta) {
  const imdb = numeric(meta?._addon?.tipImdbRating || meta?.imdbRating);
  const csfd = numeric(meta?._addon?.tipCsfdPercent);
  return imdb >= BEST_IMDB_MIN || csfd >= BEST_CSFD_MIN;
}

function sortByDateThenRating(a, b) {
  const byDate = String(b._addon?.dateAdded || '').localeCompare(String(a._addon?.dateAdded || ''));
  if (byDate) return byDate;
  const bScore = Math.max(numeric(b?._addon?.tipCsfdPercent) / 10, numeric(b?._addon?.tipImdbRating || b?.imdbRating));
  const aScore = Math.max(numeric(a?._addon?.tipCsfdPercent) / 10, numeric(a?._addon?.tipImdbRating || a?.imdbRating));
  return bScore - aScore;
}

export function filterCatalog(metas, id, type) {
  if (type !== 'movie') return [];

  let arr = [...metas].filter(m => m.type === 'movie').filter(looksLikeRealMovieMeta);

  if (id === 'filmovenovinky-filmy') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-filmy'));
  } else if (id === 'filmovenovinky-tipy') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy'));
  } else if (id === 'filmovenovinky-najlepsie') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy')).filter(isBestRatedTip);
  } else {
    return [];
  }

  if (HIDE_UNMATCHED_ITEMS) {
    arr = arr.filter(m =>
      Boolean(m._addon?.tmdbId) ||
      Boolean(m._addon?.imdbId) ||
      Boolean(m._addon?.csfdUrl) ||
      (typeof m.id === 'string' && m.id.startsWith('tt'))
    );
  }

  return arr.sort(sortByDateThenRating);
}
`;

  src = mustReplaceRegex(src, file, /export function filterCatalog\(metas, id, type\) \{[\s\S]*?\n\}/, newFilter.trimEnd());
  write(file, src);
}

function patchWorkflow() {
  const file = '.github/workflows/refresh-cache.yml';
  let src = read(file);
  if (!src.includes('TIPS_SOURCE_URL:')) {
    src = src.replace(
      '          MOVIES_SOURCE_URL: https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes\n',
      `          MOVIES_SOURCE_URL: https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes\n          ENABLE_TIPS_CATALOG: "true"\n          TIPS_SOURCE_URL: https://www.filmovenovinky.sk/top-filmy/tipy-na-dobry-film-a-serial-s-dabingom-aj-s-titulkami\n          TIPS_MAX_ITEMS: 250\n          BEST_IMDB_MIN: 6.5\n          BEST_CSFD_MIN: 65\n`
    );
  }
  write(file, src);
}

patchPackage();
patchServer();
patchScrape();
patchCatalog();
patchWorkflow();

console.log('Tipy and Najlepšie hodnotené catalogs patch applied.');
