// scripts/stream-source-repair.js
// Repair missing detailUrl/sourceUrl for FilmovéNovinky items.
// Works best when sourceUrl points to a FilmovéNovinky listing page that contains CSFD links.

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_CACHE_PATH = path.join(process.cwd(), 'data', 'cache.json');

function normalizeUrl(u) {
  if (!u) return null;
  return String(u).trim();
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 FilmoveNovinkyStremioAddon/stream-repair',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
  return await res.text();
}

function absolutizeUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function getCandidateListingUrls(item) {
  return unique([
    normalizeUrl(item.sourceUrl),
    normalizeUrl(item.listUrl),
    normalizeUrl(item.pageUrl),
    normalizeUrl(item.categoryUrl)
  ]);
}

function extractNearbyFilmovenovinkyDetailUrl(html, baseUrl, item) {
  const csfdUrl = normalizeUrl(item.csfdUrl);
  const names = unique([item.name, item.title, item.titleRaw, item.originalName].map(x => x && String(x).trim()));

  // 1) Strongest match: find block around CSFD URL and use nearby internal FilmovéNovinky article/detail link.
  if (csfdUrl) {
    const csfdNeedle = csfdUrl.replace(/^https?:\/\/(www\.)?/, '');
    const idx = html.indexOf(csfdNeedle);
    if (idx >= 0) {
      const start = Math.max(0, idx - 3500);
      const end = Math.min(html.length, idx + 3500);
      const block = html.slice(start, end);
      const links = [...block.matchAll(/href=["']([^"']+)["']/gi)]
        .map(m => absolutizeUrl(m[1], baseUrl))
        .filter(Boolean)
        .filter(u => u.includes('filmovenovinky.sk'))
        .filter(u => !u.includes('#') && !u.includes('/wp-content/') && !u.match(/\.(jpg|jpeg|png|webp|gif|css|js)$/i));

      // Prefer links that are not the same listing URL and look like article pages.
      const preferred = links.find(u => u !== baseUrl && !u.includes('/category/') && !u.includes('/tag/'));
      if (preferred) return preferred;
    }
  }

  // 2) Fallback: find blocks around title/name and grab nearby internal link.
  for (const name of names) {
    const plain = escapeRegex(name);
    const re = new RegExp(plain, 'i');
    const m = html.match(re);
    if (!m || m.index == null) continue;
    const start = Math.max(0, m.index - 3000);
    const end = Math.min(html.length, m.index + 3000);
    const block = html.slice(start, end);
    const links = [...block.matchAll(/href=["']([^"']+)["']/gi)]
      .map(x => absolutizeUrl(x[1], baseUrl))
      .filter(Boolean)
      .filter(u => u.includes('filmovenovinky.sk'))
      .filter(u => u !== baseUrl)
      .filter(u => !u.includes('/wp-content/') && !u.match(/\.(jpg|jpeg|png|webp|gif|css|js)$/i));
    if (links[0]) return links[0];
  }

  return null;
}

function needsStreamSourceRepair(item) {
  return item && item.type === 'movie' && (!item.detailUrl || item.detailUrl === null || item.streamStatus === 'missing_source' || item.streamStatus === 'not_found');
}

async function repairMissingStreamSources(options = {}) {
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const limit = Number(options.limit || 100);
  const cacheRaw = await fs.readFile(cachePath, 'utf8');
  const cache = JSON.parse(cacheRaw);
  const items = Array.isArray(cache.items) ? cache.items : Array.isArray(cache.movies) ? cache.movies : [];

  const targets = items.filter(needsStreamSourceRepair).slice(0, limit);
  const listingCache = new Map();
  const results = [];

  for (const item of targets) {
    const listings = getCandidateListingUrls(item);
    let found = null;
    let error = null;

    for (const listingUrl of listings) {
      try {
        let html = listingCache.get(listingUrl);
        if (!html) {
          html = await fetchText(listingUrl);
          listingCache.set(listingUrl, html);
        }
        found = extractNearbyFilmovenovinkyDetailUrl(html, listingUrl, item);
        if (found) break;
      } catch (e) {
        error = e.message;
      }
    }

    if (found) {
      item.detailUrl = found;
      item.streamSourceUrl = found;
      item.streamStatus = 'source_found';
      item.streamRepairAt = new Date().toISOString();
      results.push({ title: item.name || item.titleRaw, ok: true, detailUrl: found });
    } else {
      item.streamStatus = 'missing_source';
      item.streamRepairAt = new Date().toISOString();
      results.push({ title: item.name || item.titleRaw, ok: false, error: error || 'detailUrl not found near CSFD/title on listing page' });
    }
  }

  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));

  return {
    ok: true,
    checked: targets.length,
    fixed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}

module.exports = {
  repairMissingStreamSources,
  needsStreamSourceRepair
};
