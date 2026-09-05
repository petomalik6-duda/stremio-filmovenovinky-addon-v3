import fs from 'fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }

function replaceRegex(content, regex, replacement, label) {
  const next = content.replace(regex, replacement);
  if (next === content) throw new Error('No change for ' + label);
  return next;
}

function patchScrape() {
  const file = 'src/scrape.js';
  let src = read(file);

  // Tipy musia zostať samostatné položky aj keď rovnaký film existuje v hlavnom
  // katalógu noviniek. Inak sa zlúčia a zdedia dátum/poradie z hlavnej stránky.
  src = src.replace(
    /(function createTipItem\([\s\S]*?)(\n\s*item\.key = itemKey\(item\);\n\s*return item;\n\}\n\nfunction parseTextList)/,
    (_m, before, after) => `${before}\n  item.key = ` + '`tips|${itemKey(item)}`' + `;${after.replace(/\n\s*item\.key = itemKey\(item\);/, '')}`
  );

  if (!src.includes('tips|${itemKey(item)}')) {
    throw new Error('createTipItem key prefix was not applied');
  }

  const mergeFn = `function mergeCatalogItems(items) {
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

export async function scrapeFilmovenovinky`;

  src = replaceRegex(
    src,
    /function mergeCatalogItems\(items\) \{[\s\S]*?\n\}\n\nexport async function scrapeFilmovenovinky/,
    mergeFn,
    'mergeCatalogItems exact-key split'
  );

  write(file, src);
}

function patchCatalog() {
  const file = 'src/catalog.js';
  let src = read(file);

  src = src.replace(/const BEST_IMDB_MIN = Number\(process\.env\.BEST_IMDB_MIN \|\| [0-9.]+\);/, "const BEST_IMDB_MIN = Number(process.env.BEST_IMDB_MIN || 7.2);");
  src = src.replace(/const BEST_CSFD_MIN = Number\(process\.env\.BEST_CSFD_MIN \|\| [0-9.]+\);/, "const BEST_CSFD_MIN = Number(process.env.BEST_CSFD_MIN || 78);");

  if (!src.includes('sourceOrder: Number.isFinite(Number(item.order))')) {
    src = src.replace(
      '      titleRaw: item.titleRaw,\n      // Stabilný alias',
      '      titleRaw: item.titleRaw,\n      sourceOrder: Number.isFinite(Number(item.order)) ? Number(item.order) : null,\n      // Stabilný alias'
    );
  }

  if (!src.includes('meta?._addon?.sourceOrder')) {
    src = src.replace(
      '  if ((item?.tipCsfdPercent ?? null) !== (meta?._addon?.tipCsfdPercent ?? null)) return true;\n\n  // Staršie cache',
      `  if ((item?.tipCsfdPercent ?? null) !== (meta?._addon?.tipCsfdPercent ?? null)) return true;
  const itemOrder = Number.isFinite(Number(item?.order)) ? Number(item.order) : null;
  const metaOrder = Number.isFinite(Number(meta?._addon?.sourceOrder)) ? Number(meta._addon.sourceOrder) : null;
  if (itemOrder !== metaOrder) return true;

  // Staršie cache`
    );
  }

  const sortBlock = `function sourceOrder(meta) {
  const n = Number(meta?._addon?.sourceOrder);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function compareDatesDesc(a, b) {
  return String(b._addon?.dateAdded || '').localeCompare(String(a._addon?.dateAdded || ''));
}

function sortByDateThenOrder(a, b) {
  const byDate = compareDatesDesc(a, b);
  if (byDate) return byDate;
  const byOrder = sourceOrder(a) - sourceOrder(b);
  if (Number.isFinite(byOrder) && byOrder) return byOrder;
  return String(a.name || '').localeCompare(String(b.name || ''), 'sk');
}

function sortTipsByPageOrder(a, b) {
  const byOrder = sourceOrder(a) - sourceOrder(b);
  if (Number.isFinite(byOrder) && byOrder) return byOrder;
  return sortByDateThenOrder(a, b);
}

function sortBestTipsByRating(a, b) {
  const byScore = tipScore(b) - tipScore(a);
  if (byScore) return byScore;

  const byCsfd = tipCsfd(b) - tipCsfd(a);
  if (byCsfd) return byCsfd;

  const byImdb = tipImdb(b) - tipImdb(a);
  if (byImdb) return byImdb;

  return sortTipsByPageOrder(a, b);
}

export function filterCatalog`;

  src = replaceRegex(
    src,
    /function sortTipsByDate\(a, b\) \{[\s\S]*?\n\}\n\nfunction sortBestTipsByRating\(a, b\) \{[\s\S]*?\n\}\n\nexport function filterCatalog/,
    sortBlock,
    'catalog sort block with sourceOrder'
  );

  src = src.replace(
    "const sortFn = id === 'filmovenovinky-najlepsie' ? sortBestTipsByRating : sortTipsByDate;",
    "const sortFn = id === 'filmovenovinky-najlepsie' ? sortBestTipsByRating : (id === 'filmovenovinky-tipy' ? sortTipsByPageOrder : sortByDateThenOrder);"
  );

  write(file, src);
}

function patchPublicMeta() {
  const file = 'src/public-meta.js';
  let src = read(file);

  if (!src.includes('function placeholderPoster(name)')) {
    src = src.replace(
      'function asString(value) {\n',
      "function placeholderPoster(name) {\n  return `https://placehold.co/500x750/222222/ffffff.png?text=${encodeURIComponent(String(name || 'CZ/SK').slice(0, 35))}`;\n}\n\nfunction asString(value) {\n"
    );
  }

  if (!src.includes('Serve-time fallback so older cache entries')) {
    const marker = '  // First strip internal/non-standard cache fields and normalize strict types.\n  const safeMeta = cleanKnownMetaFields(meta);\n';
    if (!src.includes(marker)) throw new Error('public-meta insertion marker not found');
    src = src.replace(
      marker,
      `  // First strip internal/non-standard cache fields and normalize strict types.
  const safeMeta = cleanKnownMetaFields(meta);

  // Serve-time fallback so older cache entries and newly added tip items never
  // render as blank cards in Stremio/Nuvio/Fusion.
  const displayName = safeMeta.name || meta.name || 'CZ/SK';
  if (!safeMeta.poster) safeMeta.poster = placeholderPoster(displayName);
  if (!safeMeta.posterShape) safeMeta.posterShape = 'poster';
  if (!safeMeta.background) safeMeta.background = safeMeta.poster;
`
    );
  }

  write(file, src);
}

function patchPackage() {
  const file = 'package.json';
  const pkg = JSON.parse(read(file));
  pkg.version = '3.7.15';
  write(file, JSON.stringify(pkg, null, 2) + '\n');
}

patchScrape();
patchCatalog();
patchPublicMeta();
patchPackage();
console.log('Tip catalog source-order separation patch applied.');
