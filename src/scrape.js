import crypto from 'crypto';
import { getWithRetry } from './http.js';
import * as cheerio from 'cheerio';

export const MOVIES_SOURCE_URL = process.env.MOVIES_SOURCE_URL || 'https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes';
export const SERIES_SOURCE_URL = process.env.SERIES_SOURCE_URL || 'https://www.filmovenovinky.sk/';
const UA = 'Mozilla/5.0 (compatible; StremioFilmovenovinkyAddon/3.2; +https://www.stremio.com/)';

function absUrl(href, base) { if (!href) return null; try { return new URL(href, base).toString(); } catch { return null; } }
function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function parseDate(text) {
  const m = clean(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
}
function today() { return new Date().toISOString().slice(0, 10); }
function langFromText(text) { return text.match(/\((CZ\/SK|CZ|SK)\)/i)?.[1]?.toUpperCase() || 'CZ/SK'; }
export function itemKey(item) { return `${item.type}|${item.name}|${item.originalName || ''}|${item.year}|${item.lang}`.toLowerCase(); }

function parseTitleParts(raw, fallbackType='movie') {
  const lang = langFromText(raw);
  const years = [...raw.matchAll(/\((\d{4})\)/g)].map(m => m[1]);
  const year = years[years.length - 1] || '';
  const isSeries = /\b(seri[aá]l|s[eé]ria|season|\d+\.\s*s[eé]ria|tv seri[aá]ly)\b/i.test(raw) || fallbackType === 'series';

  let name = clean(raw)
    .replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s*/g, '')
    .replace(/\((CZ\/SK|CZ|SK)\)/ig, '')
    .replace(/\(\d{4}\)/g, '')
    .replace(/\b\d+\.\s*s[eé]ria\b/ig, '')
    .replace(/\b[0-9]+\.\s*season\b/ig, '')
    .replace(/\s+-\s*(Netflix|Apple TV\+?|Prime Video|Disney\+?|HBO|Max).*$/i, '')
    .trim();

  const [local, ...rest] = name.split('/').map(s => clean(s)).filter(Boolean);
  return { name: local || name, originalName: rest.join(' / '), year, lang, type: isSeries ? 'series' : fallbackType };
}

async function fetchPage(url) {
  console.log('[scrape] fetching', url);
  const { data } = await getWithRetry(url, { headers: { 'User-Agent': UA } });
  console.log('[scrape] fetched', url, 'bytes=', String(data || '').length);
  return data;
}

function extractLinks($, el, baseUrl) {
  return $(el).find('a').map((_j, a) => absUrl($(a).attr('href'), baseUrl)).get().filter(Boolean);
}

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function makeMovieItem($, el, text, currentDate) {
  const links = extractLinks($, el, MOVIES_SOURCE_URL);
  const csfdUrl = links.find(href => /(^|\.)csfd\.(cz|sk)/i.test(safeHost(href))) || null;
  const detailUrl = links.find(href => !/(^|\.)csfd\.(cz|sk)/i.test(safeHost(href))) || null;
  const parts = parseTitleParts(text, 'movie');
  if (!parts.name || parts.name.length < 2) return null;

  const item = {
    titleRaw: text,
    ...parts,
    type: 'movie',
    dateAdded: currentDate || parseDate(text) || today(),
    sourceUrl: MOVIES_SOURCE_URL,
    detailUrl,
    csfdUrl,
    links
  };
  item.key = itemKey(item);
  return item;
}

export async function scrapeMovies(maxItems = 250) {
  const html = await fetchPage(MOVIES_SOURCE_URL);
  const $ = cheerio.load(html);
  const items = [];
  let currentDate = null;

  // Pôvodný režim: dátumový nadpis + li položky.
  $('h1, h2, h3, h4, li, p').each((_i, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = clean($(el).text());
    const maybeDate = parseDate(text);
    if ((tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') && maybeDate) {
      currentDate = maybeDate;
      return;
    }

    if (!/\((CZ\/SK|CZ|SK)\)/i.test(text)) return;

    // v3 vyžadovala currentDate; v3.1 ho už nevyžaduje, inak po zmene HTML vracala 0 položiek.
    const item = makeMovieItem($, el, text, currentDate);
    if (item) items.push(item);
  });

  // Fallback: ak web zmení štruktúru, skús hľadať všetky odkazy/položky s CZ/SK v texte.
  if (items.length === 0) {
    $('a, li, p, article').each((_i, el) => {
      const text = clean($(el).text());
      if (!/\((CZ\/SK|CZ|SK)\)/i.test(text)) return;
      const item = makeMovieItem($, el, text, parseDate(text) || today());
      if (item) items.push(item);
    });
  }

  const sourceHash = crypto.createHash('sha1').update(items.map(i => i.key).join('|') || html).digest('hex');
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items: unique(items).slice(0, maxItems).map((x,i) => ({...x, order: i})) };
}

export async function scrapeSeries(maxItems = 80) {
  const html = await fetchPage(SERIES_SOURCE_URL);
  const sourceHash = crypto.createHash('sha1').update(html).digest('hex');
  const $ = cheerio.load(html);
  const items = [];

  $('article, .item, .post, li, h2, h3, a').each((_i, el) => {
    const text = clean($(el).text());
    if (!text || !/TV seri[aá]ly|seri[aá]l|s[eé]ria|season/i.test(text)) return;

    const a = $(el).is('a') ? $(el) : $(el).find('a').first();
    const href = absUrl(a.attr('href'), SERIES_SOURCE_URL) || null;
    const title = clean(a.text()) || clean(text.split(/\d{1,2}\.\s*[a-záäčďéíĺľňóôŕšťúýž]+\s*\d{4}/i)[0]) || text;
    if (title.length < 3 || title.length > 180) return;

    const date = parseDate(text) || today();
    const parts = parseTitleParts(title, 'series');
    const item = { titleRaw: title, ...parts, type: 'series', dateAdded: date, sourceUrl: SERIES_SOURCE_URL, detailUrl: href, csfdUrl: null, links: href ? [href] : [] };
    item.key = itemKey(item);
    items.push(item);
  });

  return { sourceUrl: SERIES_SOURCE_URL, sourceHash, items: unique(items).slice(0, maxItems) };
}

function unique(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

export async function scrapeFilmovenovinky(maxItems = 250) {
  const moviesResult = await scrapeMovies(maxItems);
  let seriesResult = { sourceHash: '', items: [] };

  try {
    seriesResult = await scrapeSeries(Number(process.env.MAX_SERIES || 80));
  } catch (e) {
    console.error('Series scrape failed:', e.message);
  }

  const sourceHash = crypto.createHash('sha1').update(`${moviesResult.sourceHash}|${seriesResult.sourceHash}`).digest('hex');
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items: [...moviesResult.items, ...seriesResult.items] };
}
