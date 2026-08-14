import { getWithRetry } from './http.js';
import * as cheerio from 'cheerio';
import { extractExplicitImdbIdFromHtml } from './matching.js';
import { parseCsfdReaderText } from './csfd-reader.js';

const UA = 'Mozilla/5.0 (compatible; StremioFilmovenovinkyAddon/2.0)';

function absAttr(url) {
  if (!url) return null;
  try { return new URL(url, 'https://www.csfd.cz').toString(); } catch { return null; }
}

function clean(text = '') { return text.replace(/\s+/g, ' ').trim(); }


async function fetchCsfdReaderMeta(csfdUrl) {
  if (!csfdUrl) return {};
  try {
    const readerUrl = `https://r.jina.ai/${csfdUrl}`;
    const { data } = await getWithRetry(readerUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/plain' },
      timeout: 30000,
      responseType: 'text'
    });
    return parseCsfdReaderText(data);
  } catch (e) {
    return { csfdReaderError: e.message };
  }
}



export async function searchCsfd(title, year) {
  if (!title) return null;
  const q = encodeURIComponent(`${title} ${year || ''}`.trim());
  const url = `https://www.csfd.cz/hledat/?q=${q}`;
  try {
    const { data } = await getWithRetry(url, { headers: { 'User-Agent': UA }, timeout: 20000 });
    const $ = cheerio.load(data);
    const link = $('a[href*="/film/"]').filter((_i, a) => {
      const t = clean($(a).text()).toLowerCase();
      return t && (!year || $(a).parent().text().includes(year));
    }).first().attr('href') || $('a[href*="/film/"]').first().attr('href');
    return absAttr(link);
  } catch {
    return null;
  }
}

export async function fetchCsfdMeta(csfdUrl) {
  if (!csfdUrl) return {};
  try {
    const { data } = await getWithRetry(csfdUrl, { headers: { 'User-Agent': UA }, timeout: 25000 });
    const $ = cheerio.load(data);
    const imdbId = extractExplicitImdbIdFromHtml(data);
    const rating = clean($('.film-rating-average, .rating-average, .film-rating .average').first().text()) || null;
    const poster = absAttr($('meta[property="og:image"]').attr('content')) || null;
    const description = clean($('meta[property="og:description"]').attr('content') || $('.plot-full, .plot').first().text()) || '';
    const title = clean($('meta[property="og:title"]').attr('content') || $('h1').first().text()) || '';
    const yearText = clean($('main').first().text() || $('body').text());
    const csfdYear = yearText.match(/\b(19\d{2}|20\d{2})\b/)?.[1] || null;
    const genres = [];
    $('.genres a, .genre a, a[href*="/zanr/"]').each((_i, a) => genres.push(clean($(a).text())));
    const direct = { imdbId, csfdRating: rating, poster, description, csfdTitle: title, csfdYear, genres: [...new Set(genres.filter(Boolean))] };

    // ČSFD používa anti-bot ochranu; HTTP 200 môže byť iba blokovacia stránka bez dát.
    // Vtedy doplň chýbajúce polia cez Jina Reader, nie cez náhodný title search.
    if (!direct.imdbId && !direct.poster && direct.description.length < 20) {
      const reader = await fetchCsfdReaderMeta(csfdUrl);
      return {
        ...direct,
        imdbId: direct.imdbId || reader.imdbId || null,
        poster: direct.poster || reader.poster || null,
        description: direct.description || reader.description || '',
        csfdTitle: direct.csfdTitle || reader.title || '',
        csfdYear: direct.csfdYear || reader.csfdYear || null,
        genres: direct.genres.length ? direct.genres : (reader.genres || []),
        csfdReaderError: reader.csfdReaderError
      };
    }
    return direct;
  } catch (e) {
    const reader = await fetchCsfdReaderMeta(csfdUrl);
    return {
      imdbId: reader.imdbId || null,
      csfdRating: null,
      poster: reader.poster || null,
      description: reader.description || '',
      csfdTitle: reader.title || '',
      csfdYear: reader.csfdYear || null,
      genres: reader.genres || [],
      csfdError: e.message,
      csfdReaderError: reader.csfdReaderError
    };
  }
}
