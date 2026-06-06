import crypto from 'crypto';
import { getWithRetry } from './http.js';
import * as cheerio from 'cheerio';

export const MOVIES_SOURCE_URL = process.env.MOVIES_SOURCE_URL || 'https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes';
export const SERIES_SOURCE_URL = process.env.SERIES_SOURCE_URL || '';
const DISABLE_SERIES = String(process.env.DISABLE_SERIES || 'true').toLowerCase() === 'true';

const UA = 'Mozilla/5.0 (compatible; StremioFilmovenovinkyAddon/3.4.1; +https://www.stremio.com/)';
const USE_READER_FALLBACK = String(process.env.USE_READER_FALLBACK || 'true').toLowerCase() !== 'false';
const STRICT_MOVIE_FILTER = String(process.env.STRICT_MOVIE_FILTER || 'true').toLowerCase() !== 'false';
const REQUIRE_YEAR_FOR_LOCAL_ITEMS = String(process.env.REQUIRE_YEAR_FOR_LOCAL_ITEMS || 'true').toLowerCase() !== 'false';

function absUrl(href, base) { if (!href) return null; try { return new URL(href, base).toString(); } catch { return null; } }
function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function parseDate(text) {
  const m = clean(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
}
function today() { return new Date().toISOString().slice(0, 10); }
function langFromText(text) { return text.match(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/i)?.[1]?.toUpperCase().replace('SK/CZ', 'CZ/SK') || 'CZ/SK'; }
export function itemKey(item) { return `${item.type}|${item.name}|${item.originalName || ''}|${item.year}|${item.lang}`.toLowerCase(); }

function readerUrl(url) {
  // Jina Reader vie vrátiť HTML stránku ako jednoduchý markdown/text.
  return `https://r.jina.ai/http://r.jina.ai/http://${url}`;
}

function parseTitleParts(raw, fallbackType='movie') {
  const lang = langFromText(raw);
  const years = [...raw.matchAll(/\((\d{4})\)/g)].map(m => m[1]);
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

  // Neber extrémne všeobecné riadky typu "CZ dabing", "SK titulky" atď.
  if (/^(cz|sk|cz\/sk|dabing|titulky|film|filmy)\b/i.test(t) && t.split(' ').length < 4) return true;

  return false;
}

function hasMovieShape(text) {
  const t = clean(text);

  // Najbezpečnejší tvar stránky: Názov / Original (2026) (CZ)
  const hasLang = /\((CZ\/SK|SK\/CZ|CZ|SK)\)/i.test(t);
  const hasYear = /\((19\d{2}|20\d{2})\)/.test(t) || /\b(19\d{2}|20\d{2})\b/.test(t);

  if (!hasLang) return false;
  if (REQUIRE_YEAR_FOR_LOCAL_ITEMS && !hasYear) return false;

  // Musí mať aspoň trochu názvu pred značkou jazyka.
  const beforeLang = clean(t.split(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/i)[0]);
  if (beforeLang.length < 3) return false;

  return true;
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
    detailUrl: null,
    csfdUrl: null,
    links: []
  };
  item.key = itemKey(item);
  return item;
}

function makeMovieItem($, el, text, currentDate) {
  const links = extractLinks($, el, MOVIES_SOURCE_URL);
  const csfdUrl = links.find(href => /(^|\.)csfd\.(cz|sk)/i.test(safeHost(href))) || null;
  const detailUrl = links.find(href => !/(^|\.)csfd\.(cz|sk)/i.test(safeHost(href))) || null;
  const item = makeMovieItemFromText(text, currentDate, MOVIES_SOURCE_URL, 'movie');
  if (!item) return null;
  item.csfdUrl = csfdUrl;
  item.detailUrl = detailUrl;
  item.links = links;
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

    if (items.length === 0) {
      items = parseTextList($.text(), MOVIES_SOURCE_URL, 'movie');
    }
  }

  items = unique(items).slice(0, maxItems).map((x, i) => ({ ...x, type: 'movie', order: i }));
  const sourceHash = crypto.createHash('sha1').update(items.map(i => i.key).join('|') || raw).digest('hex');
  console.log('[scrape] movies items=', items.length, 'mode=', mode);
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items };
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
      const item = { titleRaw: title, ...parts, type: 'series', dateAdded: date, sourceUrl: SERIES_SOURCE_URL, detailUrl: href, csfdUrl: null, links: href ? [href] : [] };
      item.key = itemKey(item);
      items.push(item);
    });

    if (items.length === 0) {
      items = parseTextList($.text(), SERIES_SOURCE_URL, 'series').map(x => ({ ...x, type: 'series' }));
    }
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

export async function scrapeFilmovenovinky(maxItems = 1000) {
  const moviesResult = await scrapeMovies(maxItems);

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

  const sourceHash = crypto.createHash('sha1').update(`${moviesResult.sourceHash}|${seriesResult.sourceHash}`).digest('hex');
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items: [...moviesResult.items, ...seriesResult.items] };
}
