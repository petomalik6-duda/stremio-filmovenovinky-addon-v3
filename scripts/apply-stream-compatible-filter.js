import fs from 'fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }

const file = 'src/catalog.js';
let src = read(file);

if (!src.includes('function hasStreamCompatibleId(meta)')) {
  const marker = `function hasCatalog(meta, catalogId) {
  return catalogIdsForMeta(meta).includes(catalogId);
}
`;
  const insert = `${marker}
function hasStreamCompatibleId(meta) {
  const imdb = meta?._addon?.imdbId || (typeof meta?.id === 'string' && /^tt\\d+$/.test(meta.id) ? meta.id : null);
  return Boolean(imdb && /^tt\\d+$/.test(String(imdb)));
}
`;
  if (!src.includes(marker)) throw new Error('hasCatalog marker not found');
  src = src.replace(marker, insert);
}

const oldBlock = `  if (id === 'filmovenovinky-filmy') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-filmy'));
  } else if (id === 'filmovenovinky-tipy') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy'));
  } else if (id === 'filmovenovinky-tipy-serialy') {
    arr = arr.filter(m => m.type === 'series').filter(m => hasCatalog(m, 'filmovenovinky-tipy-serialy'));
  } else if (id === 'filmovenovinky-najlepsie') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy')).filter(isBestRatedTip);
  } else {
    return [];
  }
`;

const newBlock = `  if (id === 'filmovenovinky-filmy') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-filmy'));
  } else if (id === 'filmovenovinky-tipy') {
    // Stream add-ons are normally keyed by IMDb tt ids. Hide local-only tip
    // entries so users do not see catalog cards that can never find streams.
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy')).filter(hasStreamCompatibleId);
  } else if (id === 'filmovenovinky-tipy-serialy') {
    arr = arr.filter(m => m.type === 'series').filter(m => hasCatalog(m, 'filmovenovinky-tipy-serialy')).filter(hasStreamCompatibleId);
  } else if (id === 'filmovenovinky-najlepsie') {
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy')).filter(isBestRatedTip).filter(hasStreamCompatibleId);
  } else {
    return [];
  }
`;

if (src.includes(oldBlock)) {
  src = src.replace(oldBlock, newBlock);
} else if (!src.includes('.filter(hasStreamCompatibleId)')) {
  throw new Error('catalog filter block not found');
}

write(file, src);

// Tipy are a separate editorial list. If the same title also appears in
// the main CZ/SK novinky catalog, it must not merge into the main item,
// otherwise Tipy inherits the wrong date/order and the list no longer
// matches FilmovéNovinky.sk. Prefix tip keys to keep them distinct.
const scrapeFile = 'src/scrape.js';
let scrape = read(scrapeFile);
const tipKeyMarker = `  item.key = itemKey(item);
  return item;
}

function parseTipsTextList`;
const tipKeyReplacement = `  item.baseKey = itemKey(item);
  item.key = 'tips|' + item.baseKey;
  return item;
}

function parseTipsTextList`;
if (scrape.includes(tipKeyMarker)) {
  scrape = scrape.replace(tipKeyMarker, tipKeyReplacement);
} else if (!scrape.includes("item.key = 'tips|' + item.baseKey")) {
  throw new Error('createTipItem key marker not found');
}
write(scrapeFile, scrape);

const pkgPath = 'package.json';
const pkg = JSON.parse(read(pkgPath));
pkg.version = '3.7.18';
write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
