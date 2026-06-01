import crypto from 'crypto';
import { getWithRetry } from './http.js';
import * as cheerio from 'cheerio';

export const MOVIES_SOURCE_URL = process.env.MOVIES_SOURCE_URL || 'https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes';
export const SERIES_SOURCE_URL = process.env.SERIES_SOURCE_URL || 'https://www.filmovenovinky.sk/';
const UA = 'Mozilla/5.0 (compatible; StremioFilmovenovinkyAddon/3.0; +https://www.stremio.com/)';

function absUrl(href, base) { if (!href) return null; try { return new URL(href, base).toString(); } catch { return null; } }
function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function parseDate(text) { const m = clean(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null; }
function langFromText(text) { return text.match(/\((CZ\/SK|CZ|SK)\)/i)?.[1]?.toUpperCase() || 'CZ/SK'; }
export function itemKey(item) { return `${item.type}|${item.name}|${item.originalName || ''}|${item.year}|${item.lang}`.toLowerCase(); }

function parseTitleParts(raw, fallbackType='movie') {
  const lang = langFromText(raw);
  const years = [...raw.matchAll(/\((\d{4})\)/g)].map(m => m[1]);
  const year = years[years.length - 1] || '';
  const isSeries = /\b(seri[aá]l|s[eé]ria|season|\d+\.\s*s[eé]ria|tv seri[aá]ly)\b/i.test(raw) || fallbackType === 'series';
  let name = clean(raw)
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
  const { data } = await getWithRetry(url, { headers: { 'User-Agent': UA }, timeout: 25000 });
  return data;
}

export async function scrapeMovies(maxItems = 500) {
  const html = await fetchPage(MOVIES_SOURCE_URL);
  const sourceHash = crypto.createHash('sha1').update(html).digest('hex');
  const $ = cheerio.load(html);
  const items = [];
  let currentDate = null;
  $('h2, h3, li').each((_i, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = clean($(el).text());
    const maybeDate = parseDate(text);
    if ((tag === 'h2' || tag === 'h3') && maybeDate) { currentDate = maybeDate; return; }
    if (tag !== 'li' || !currentDate || !/\((CZ\/SK|CZ|SK)\)/i.test(text)) return;
    const links = $(el).find('a').map((_j, a) => absUrl($(a).attr('href'), MOVIES_SOURCE_URL)).get().filter(Boolean);
    const csfdUrl = links.find(href => /(^|\.)csfd\.(cz|sk)/i.test(new URL(href).hostname)) || null;
    const detailUrl = links.find(href => !/(^|\.)csfd\.(cz|sk)/i.test(new URL(href).hostname)) || null;
    const parts = parseTitleParts(text, 'movie');
    const item = { titleRaw: text, ...parts, type: 'movie', dateAdded: currentDate, sourceUrl: MOVIES_SOURCE_URL, detailUrl, csfdUrl, links };
    item.key = itemKey(item); items.push(item);
  });
  return unique(items).slice(0, maxItems).map((x,i) => ({...x, order: i}));
}

export async function scrapeSeries(maxItems = 200) {
  const html = await fetchPage(SERIES_SOURCE_URL);
  const sourceHash = crypto.createHash('sha1').update(html).digest('hex');
  const $ = cheerio.load(html);
  const items = [];
  $('article, .item, .post, li, h2, h3').each((_i, el) => {
    const text = clean($(el).text());
    if (!text || !/TV seri[aá]ly|seri[aá]l|s[eé]ria|season/i.test(text)) return;
    const a = $(el).find('a').first();
    const href = absUrl(a.attr('href'), SERIES_SOURCE_URL) || null;
    const title = clean(a.text()) || clean(text.split(/\d{1,2}\.\s*[a-záäčďéíĺľňóôŕšťúýž]+\s*\d{4}/i)[0]) || text;
    if (title.length < 3 || title.length > 180) return;
    const date = parseDate(text) || new Date().toISOString().slice(0,10);
    const parts = parseTitleParts(title, 'series');
    const item = { titleRaw: title, ...parts, type: 'series', dateAdded: date, sourceUrl: SERIES_SOURCE_URL, detailUrl: href, csfdUrl: null, links: href ? [href] : [] };
    item.key = itemKey(item); items.push(item);
  });
  return { sourceUrl: SERIES_SOURCE_URL, sourceHash, items: unique(items).slice(0, maxItems) };
}

function unique(items) {
  const seen = new Set();
  return items.filter(item => { if (seen.has(item.key)) return false; seen.add(item.key); return true; });
}

export async function scrapeFilmovenovinky(maxItems = 500) {
  const movies = await scrapeMovies(maxItems);
  let seriesResult = { sourceHash: '', items: [] };
  try { seriesResult = await scrapeSeries(Number(process.env.MAX_SERIES || 200)); }
  catch (e) { console.error('Series scrape failed:', e.message); }
  const sourceHash = crypto.createHash('sha1').update(`${movies.map(i=>i.key).join('|')}|${seriesResult.sourceHash}`).digest('hex');
  return { sourceUrl: MOVIES_SOURCE_URL, sourceHash, items: [...movies, ...seriesResult.items] };
}
