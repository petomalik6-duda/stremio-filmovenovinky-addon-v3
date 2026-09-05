import crypto from 'crypto';
import { getWithRetry } from './http.js';
import * as cheerio from 'cheerio';

export const MOVIES_SOURCE_URL = process.env.MOVIES_SOURCE_URL || 'https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes';
export const SERIES_SOURCE_URL = process.env.SERIES_SOURCE_URL || '';
export const TIPS_SOURCE_URL = process.env.TIPS_SOURCE_URL || 'https://www.filmovenovinky.sk/top-filmy/tipy-na-dobry-film-a-serial-s-dabingom-aj-s-titulkami';

const ENABLE_TIPS_CATALOG = String(process.env.ENABLE_TIPS_CATALOG || 'true').toLowerCase() !== 'false';
const TIPS_MAX_ITEMS = Number(process.env.TIPS_MAX_ITEMS || 250);
const DISABLE_SERIES = String(process.env.DISABLE_SERIES || 'true').toLowerCase() === 'true';
const USE_READER_FALLBACK = String(process.env.USE_READER_FALLBACK || 'true').toLowerCase() !== 'false';
const STRICT_MOVIE_FILTER = String(process.env.STRICT_MOVIE_FILTER || 'true').toLowerCase() !== 'false';
const REQUIRE_YEAR_FOR_LOCAL_ITEMS = String(process.env.REQUIRE_YEAR_FOR_LOCAL_ITEMS || 'true').toLowerCase() !== 'false';
const DETAIL_LINK_ENRICH_LIMIT = Math.max(0, Number(process.env.DETAIL_LINK_ENRICH_LIMIT || 80));
const UA = 'Mozilla/5.0 (compatible; StremioFilmovenovinkyAddon/3.7.11; +https://www.stremio.com/)';

function absUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function parseDate(text) {
  const m = clean(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function langFromText(text) {
  return text.match(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/i)?.[1]?.toUpperCase().replace('SK/CZ', 'CZ/SK') || 'CZ/SK';
}

export function itemKey(item) {
  return `${item.type}|${item.name}|${item.originalName || ''}|${item.year}|${item.lang}`.toLowerCase();
}

function readerUrl(url) {
  return `https://r.jina.ai/${url}`;
}

function parseTitleParts(raw, fallbackType = 'movie') {
  const lang = langFromText(raw);
  const years = [...String(raw || '').matchAll(/\((\d{4})\)/g)].map(m => m[1]);
  const year = years[years.length - 1] || '';
  const isSeries = /\b(tv seri[aá]l|seri[aá]l|s[eé]ria|season|\d+\.\s*s[eé]ria)\b/i.test(raw) || fallbackType === 'series';

  let name = clean(raw)
    .replace(/^[-*•\s]+/g, '')
    .replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s*/g, '')
    .replace(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/ig, '')
    .replace(/\(\d{4}\)/g, '')
    .replace(/\bTV seri[aá]l\b/ig, '')
    .replace(/\b\d+\.\s*s[eé]ria\b/ig, '')
    .replace(/\b[0-9]+\.?\s*season\b/ig, '')
    .replace(/\s+-\s*(Netflix|Apple TV\+?|Prime Video|Disney\+?|HBO|Max).*$/i, '')
    .replace(/\s+IMDb\s+.*$/i, '')
    .replace(/\s+ČSFD\s+.*$/i, '')
    .trim();

  const [local, ...rest] = name.split('/').map(s => clean(s)).filter(Boolean);
  return { name: local || name, originalName: rest.join(' / '), year, lang, type: isSeries ? 'series' : fallbackType };
}

async function fetchPage(url) {
  console.log('[scrape] fetching direct', url);
  try {
    const { data } = await getWithRetry(url, { headers: { 'User-Agent': UA } });
    console.log('[scrape] direct fetched', url, 'bytes=', String(data || '').length);
    return { data, mode: 'direct', url };
  } catch (e) {
    console.error('[scrape] direct failed:', e.message);
    if (!USE_READER_FALLBACK) throw e;
  }

  const fallback = readerUrl(url);
  console.log('[scrape] fetching reader fallback', fallback);
  const { data } = await getWithRetry(fallback, { headers: { 'User-Agent': UA } });
  console.log('[scrape] reader fetched bytes=', String(data || '').length);
  return { data, mode: 'reader', url: fallback };
}

function extractLinks($, el, baseUrl) {
  return $(el).find('a').map((_j, a) => absUrl($(a).attr('href'), baseUrl)).get().filter(Boolean);
}

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function isCsfdUrl(url) {
  return /(^|\.)csfd\.(cz|sk)$/i.test(safeHost(url));
}

function isImdbUrl(url) {
  return /(^|\.)imdb\.com$/i.test(safeHost(url)) && /\/title\/tt\d+/i.test(url);
}

function imdbIdFromUrl(value) {
  return String(value || '').match(/\/title\/(tt\d{6,12})/i)?.[1] || null;
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function extractExternalIdsFromDetailHtml(html, detailUrl) {
  const raw = String(html || '');
  const $ = cheerio.load(raw);
  const links = $('a').map((_j, a) => absUrl($(a).attr('href'), detailUrl)).get().filter(Boolean);
  const csfdUrl = links.find(isCsfdUrl) || null;
  const imdbUrl = links.find(isImdbUrl) || null;
  const imdbId = imdbIdFromUrl(imdbUrl) || raw.match(/tt\d{6,12}/i)?.[0] || null;
  return { csfdUrl, imdbId, links };
}

async function enrichItemsFromDetailPages(items, { limit = DETAIL_LINK_ENRICH_LIMIT } = {}) {
  if (!limit) return items;

  let checked = 0;
  let enriched = 0;

  for (const item of items) {
    if (checked >= limit) break;
    if (!item?.detailUrl || (item.csfdUrl && item.imdbId)) continue;
    if (!/(^|\.)filmovenovinky\.sk$/i.test(safeHost(item.detailUrl))) continue;

    checked += 1;
    try {
      const { data } = await getWithRetry(item.detailUrl, { headers: { 'User-Agent': UA } });
      const found = extractExternalIdsFromDetailHtml(data, item.detailUrl);
      let changed = false;

      if (found.csfdUrl && !item.csfdUrl) {
        item.csfdUrl = found.csfdUrl;
        changed = true;
      }
      if (found.imdbId && !item.imdbId) {
        item.imdbId = found.imdbId;
        changed = true;
      }
      if (found.links.length) item.links = uniqueStrings([...(item.links || []), ...found.links]);
      if (changed) enriched += 1;
    } catch (error) {
      console.warn('[scrape] detail link enrichment failed:', item.name, error.message);
    }
  }

  console.log(`[scrape] detail link enrichment checked=${checked} enriched=${enriched}`);
  return items;
}

function parseNumber(value) {
  if (!value || /^n\/?a$/i.test(String(value).trim())) return null;
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

function isProbablyNotMovieLine(text) {
  const t = clean(text).toLowerCase();
  if (!t) return true;
  if (t.length < 5 || t.length > 220) return true;

  const badPatterns = [
    /cookie/,
    /reklama/,
    /newsletter/,
    /facebook|instagram|youtube|tiktok/,
    /kontakt/,
    /podmienky/,
    /ochrana osobných údajov/,
    /prihlás/i,
    /registr/i,
    /menu/,
    /domov/,
    /najnovšie/,
    /trailery podľa žánru/,
    /skip to/,
    /komentár/,
    /diskusia/,
    /zdroj:/,
    /tagy:/,
    /kategórie:/,
    /zdieľať/,
    /prečítať/,
    /pokračovať/,
    /filmovenovinky\.sk/,
    /nové filmy s dabingom/,
    /zistite čo pribudlo/,
    /tipy na dobrý film/,
    /streamovacie služby/,
    /netflix|disney\+|prime video|hbo max|apple tv/,
    /seriály? s dabingom/,
    /tv program/
  ];

  if (badPatterns.some(rx => rx.test(t))) return true;
  if (/^(cz|sk|cz\/sk|dabing|titulky|film|filmy)\b/i.test(t) && t.split(' ').length < 4) return true;
  return false;
}

function hasMovieShape(text) {
  const t = clean(text);
  const hasLang = /\((CZ\/SK|SK\/CZ|CZ|SK)\)/i.test(t);
  const hasYear = /\((19\d{2}|20\d{2})\)/.test(t) || /\b(19\d{2}|20\d{2})\b/.test(t);
  if (!hasLang) return false;
  if (REQUIRE_YEAR_FOR_LOCAL_ITEMS && !hasYear) return false;
  const beforeLang = clean(t.split(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/i)[0]);
  return beforeLang.length >= 3;
}

function normalizeMovieNameForReject(name) {
  return clean(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isBadParsedTitle(name) {
  const n = normalizeMovieNameForReject(name);
  if (!n || n.length < 2 || n.length > 120) return true;

  const bad = [
    'cz', 'sk', 'cz sk', 'dabing', 'titulky',
    'nove filmy', 'filmove novinky', 'filmy online',
    'tipy na dobry film', 'serialy', 'tv serialy',
    'netflix', 'disney', 'prime video', 'hbo', 'max',
    'komentar', 'reklama', 'menu'
  ];

  return bad.some(x => n === x || n.startsWith(x + ' '));
}

function makeMovieItemFromText(text, currentDate, sourceUrl = MOVIES_SOURCE_URL, fallbackType = 'movie') {
  if (STRICT_MOVIE_FILTER && (isProbablyNotMovieLine(text) || !hasMovieShape(text))) return null;

  const parts = parseTitleParts(text, fallbackType);
  if (!parts.name || parts.name.length < 2 || parts.name.length > 150 || isBadParsedTitle(parts.name)) return null;

  const item = {
    titleRaw: clean(text),
    ...parts,
    dateAdded: currentDate || parseDate(text) || today(),
    sourceUrl,
    sourcePage: sourceUrl === TIPS_SOURCE_URL ? 'tips' : 'movies',
    catalogIds: sourceUrl === TIPS_SOURCE_URL ? ['filmovenovinky-tipy'] : ['filmovenovinky-filmy'],
    detailUrl: null,
    csfdUrl: null,
    imdbId: null,
    tmdbId: null,
    links: []
  };
  item.key = itemKey(item);
  return item;
}

function makeMovieItem($, el, text, currentDate) {
  const links = extractLinks($, el, MOVIES_SOURCE_URL);
  const csfdUrl = links.find(isCsfdUrl) || null;
  const detailUrl = links.find(href => !isCsfdUrl(href)) || null;
  const item = makeMovieItemFromText(text, currentDate, MOVIES_SOURCE_URL, 'movie');
  if (!item) return null;
  item.csfdUrl = csfdUrl;
  item.detailUrl = detailUrl;
  item.links = links;
  return item;
}

function createTipItem(title, ratingText, currentDate, { links = [], detailUrl = null, csfdUrl = null } = {}) {
  const cleanTitleText = clean(String(title || '').replace(/^#+\s*/, ''));
  if (!cleanTitleText || !/\((19\d{2}|20\d{2})\)/.test(cleanTitleText)) return null;

  const ratings = parseTipRatings(ratingText);
  if (ratings.isSeries || /\b(tv seri[aá]l|seri[aá]l|s[eé]ria)\b/i.test(`${cleanTitleText} ${ratingText}`)) return null;

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
  item.key = `tips|${itemKey(item)}`;
  return item;
}

function parseTextList(rawText, sourceUrl, fallbackType = 'movie') {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => clean(line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')))
    .filter(Boolean);

  const items = [];
  let currentDate = null;

  for (const line of lines) {
    const date = parseDate(line);
    if (date && line.length < 80) {
      currentDate = date;
      continue;
    }

    if (!/\((CZ\/SK|SK\/CZ|CZ|SK)\)/i.test(line)) continue;
    if (/cookie|reklama|menu|trailery podľa žánru|skip to/i.test(line)) continue;

    const item = makeMovieItemFromText(line, currentDate, sourceUrl, fallbackType);
    if (item) items.push(item);
  }

  return unique(items);
}

function parseTipsTextList(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => clean(line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')))
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
      continue;
    }

    if (/\((19\d{2}|20\d{2})\)/.test(titleLine) && /IMDb|ČSFD/i.test(titleLine)) {
      const [title, ...rest] = titleLine.split(/\s+(?=IMDb|ČSFD)/i);
      const item = createTipItem(title, rest.join(' '), currentDate);
      if (item) items.push(item);
    }
  }

  return unique(items).slice(0, TIPS_MAX_ITEMS).map((x, i) => ({ ...x, order: i }));
}

export async function scrapeMovies(maxItems = 1000) {
  const { data, mode } = await fetchPage(MOVIES_SOURCE_URL);
  const raw = String(data || '');
  let items = [];

  if (mode === 'reader' || !/<html|<body|<li|<article/i.test(raw)) {
    items = parseTextList(raw, MOVIES_SOURCE_URL, 'movie');
  } else {
    const $ = cheerio.load(raw);
    let currentDate = null;

    $('h1, h2, h3, h4, li, p, article').each((_i, el) => {
      const tag = el.tagName?.toLowerCase();
      const text = clean($(el).text());
      const maybeDate = parseDate(text);
      if ((tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') && maybeDate) {
        currentDate = maybeDate;
        return;
      }

      if (!/\((CZ\/SK|SK\/CZ|CZ|SK)\)/i.test(text)) return;
      const item = makeMovieItem($, el, text, currentDate);
      if (item) items.push(item);
    });

    if (items.length === 0) items = parseTextList($.text(), MOVIES_SOURCE_URL, 'movie');
  }

  items = unique(items).slice(0, maxItems).map((x, i) => ({ ...x, type: 'movie', order: i }));
  await enrichItemsFromDetailPages(items);
  const sourceHash = crypto.createHash('sha1').update(items.map(i => i.key).join('|') || raw).digest('hex');
  console.log('[scrape] movies items=', items.length, 'mode=', mode);
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items };
}

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
  await enrichItemsFromDetailPages(items, { limit: Math.min(20, DETAIL_LINK_ENRICH_LIMIT) });
  const sourceHash = crypto.createHash('sha1').update(items.map(i => i.key).join('|') || raw).digest('hex');
  console.log('[scrape] tips items=', items.length, 'mode=', mode);
  return { sourceUrl: TIPS_SOURCE_URL, sourceHash, items };
}

export async function scrapeSeries(maxItems = 40) {
  const { data, mode } = await fetchPage(SERIES_SOURCE_URL);
  const raw = String(data || '');
  let items = [];

  if (mode === 'reader' || !/<html|<body|<li|<article/i.test(raw)) {
    items = parseTextList(raw, SERIES_SOURCE_URL, 'series').map(x => ({ ...x, type: 'series' }));
  } else {
    const $ = cheerio.load(raw);
    $('article, .item, .post, li, h2, h3, a, p').each((_i, el) => {
      const text = clean($(el).text());
      if (!text || !/TV seri[aá]l|seri[aá]l|s[eé]ria|season|\((CZ\/SK|SK\/CZ|CZ|SK)\)/i.test(text)) return;

      const a = $(el).is('a') ? $(el) : $(el).find('a').first();
      const href = absUrl(a.attr('href'), SERIES_SOURCE_URL) || null;
      const title = clean(a.text()) || text;
      if (title.length < 3 || title.length > 180) return;

      const date = parseDate(text) || today();
      const parts = parseTitleParts(title, 'series');
      const item = { titleRaw: title, ...parts, type: 'series', dateAdded: date, sourceUrl: SERIES_SOURCE_URL, detailUrl: href, csfdUrl: null, links: href ? [href] : [], catalogIds: ['filmovenovinky-serialy'] };
      item.key = itemKey(item);
      items.push(item);
    });

    if (items.length === 0) items = parseTextList($.text(), SERIES_SOURCE_URL, 'series').map(x => ({ ...x, type: 'series' }));
  }

  items = unique(items).slice(0, maxItems);
  const sourceHash = crypto.createHash('sha1').update(items.map(i => i.key).join('|') || raw).digest('hex');
  console.log('[scrape] series items=', items.length, 'mode=', mode);
  return { sourceUrl: SERIES_SOURCE_URL, sourceHash, items };
}

function unique(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function mergeCatalogItems(items) {
  const byKey = new Map();

  for (const item of items || []) {
    if (!item) continue;

    // Používame presný item.key. Tipy majú prefix tips|..., takže sa nezlúčia
    // s rovnakým filmom z hlavného CZ/SK katalógu a zachovajú si vlastné poradie.
    const key = item.key || itemKey(item);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...item, key, catalogIds: uniqueStrings(item.catalogIds || ['filmovenovinky-filmy']) });
      continue;
    }

    existing.catalogIds = uniqueStrings([...(existing.catalogIds || []), ...(item.catalogIds || [])]);
    existing.links = uniqueStrings([...(existing.links || []), ...(item.links || [])]);
    existing.detailUrl = existing.detailUrl || item.detailUrl || null;
    existing.csfdUrl = existing.csfdUrl || item.csfdUrl || null;
    existing.imdbId = existing.imdbId || item.imdbId || null;
    existing.tmdbId = existing.tmdbId || item.tmdbId || null;
    existing.tipGenre = existing.tipGenre || item.tipGenre || null;
    existing.tipImdbRating = existing.tipImdbRating ?? item.tipImdbRating ?? null;
    existing.tipCsfdPercent = existing.tipCsfdPercent ?? item.tipCsfdPercent ?? null;
    existing.tipAvailability = existing.tipAvailability || item.tipAvailability || null;
    existing.sourcePage = existing.sourcePage || item.sourcePage || null;
    existing.titleRaw = existing.titleRaw || item.titleRaw;
    existing.order = Number.isFinite(Number(existing.order)) ? Number(existing.order) : item.order;
    existing.key = key;
  }

  return [...byKey.values()].map((item, index) => ({
    ...item,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    key: item.key || itemKey(item)
  }));
}

export async function scrapeFilmovenovinky(maxItems = 1000) {
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
