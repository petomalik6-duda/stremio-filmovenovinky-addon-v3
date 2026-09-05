import fs from 'fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }

function replaceRequired(content, before, after, label) {
  if (!content.includes(before)) throw new Error(`Missing marker for ${label}`);
  return content.replace(before, after);
}

function patchScrape() {
  const file = 'src/scrape.js';
  let src = read(file);

  const createStart = src.indexOf('function createTipItem(');
  const parseTextStart = src.indexOf('\nfunction parseTextList', createStart);
  if (createStart < 0 || parseTextStart < 0) throw new Error('createTipItem block not found');

  let block = src.slice(createStart, parseTextStart);

  if (!block.includes('const itemType = ratings.isSeries')) {
    const ratingsStart = block.indexOf('  const ratings = parseTipRatings(ratingText);');
    const itemEndMarker = '  if (!item) return null;';
    const itemEnd = block.indexOf(itemEndMarker, ratingsStart);
    if (ratingsStart < 0 || itemEnd < 0) throw new Error('createTipItem rating/movie-only block not found');

    const replacement = [
      '  const ratings = parseTipRatings(ratingText);',
      "  const itemType = ratings.isSeries || /\\b(tv seri[aá]l|seri[aá]l|s[eé]ria)\\b/i.test(`${cleanTitleText} ${ratingText}`)",
      "    ? 'series'",
      "    : 'movie';",
      '',
      "  const parseLang = ratings.lang === 'TIT' ? 'CZ' : (ratings.lang || 'CZ/SK');",
      '  const item = makeMovieItemFromText(`${cleanTitleText} (${parseLang})`, currentDate, TIPS_SOURCE_URL, itemType);',
      '  if (!item) return null;',
      '  item.type = itemType;'
    ].join('\n');

    block = block.slice(0, ratingsStart) + replacement + block.slice(itemEnd + itemEndMarker.length);
  }

  if (block.includes("  item.catalogIds = ['filmovenovinky-tipy'];")) {
    block = block.replace(
      "  item.catalogIds = ['filmovenovinky-tipy'];",
      "  item.catalogIds = itemType === 'series' ? ['filmovenovinky-tipy-serialy'] : ['filmovenovinky-tipy'];"
    );
  }

  if (!block.includes("filmovenovinky-tipy-serialy") || !block.includes('item.type = itemType')) {
    throw new Error('createTipItem series patch failed');
  }

  src = src.slice(0, createStart) + block + src.slice(parseTextStart);

  const forcedMovieMap = "  items = unique(items).slice(0, maxItems).map((x, i) => ({ ...x, type: 'movie', order: i }));";
  if (src.includes(forcedMovieMap)) {
    src = src.replace(forcedMovieMap, "  items = unique(items).slice(0, maxItems).map((x, i) => ({ ...x, order: i }));");
  }

  write(file, src);
}

function patchCatalog() {
  const file = 'src/catalog.js';
  let src = read(file);

  const start = src.indexOf('export function filterCatalog(metas, id, type) {');
  if (start < 0) throw new Error('filterCatalog not found');

  const replacement = `export function filterCatalog(metas, id, type) {
  if (!['movie', 'series'].includes(type)) return [];

  let arr = [...metas].filter(m => m.type === type).filter(looksLikeRealMovieMeta);

  if (id === 'filmovenovinky-filmy') {
    if (type !== 'movie') return [];
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-filmy'));
  } else if (id === 'filmovenovinky-tipy') {
    if (type !== 'movie') return [];
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy'));
  } else if (id === 'filmovenovinky-tipy-serialy') {
    if (type !== 'series') return [];
    arr = arr.filter(m => hasCatalog(m, 'filmovenovinky-tipy-serialy'));
  } else if (id === 'filmovenovinky-najlepsie') {
    if (type !== 'movie') return [];
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

  const sortFn = id === 'filmovenovinky-najlepsie'
    ? sortBestTipsByRating
    : ((id === 'filmovenovinky-tipy' || id === 'filmovenovinky-tipy-serialy') ? sortTipsByPageOrder : sortByDateThenOrder);
  return arr.sort(sortFn);
}
`;

  src = src.slice(0, start) + replacement;
  write(file, src);
}

function patchServer() {
  const file = 'server.js';
  let src = read(file);

  const catalogsStart = src.indexOf('const catalogs = [');
  const manifestMarker = '\n\nconst manifest = {';
  const manifestStart = src.indexOf(manifestMarker, catalogsStart);
  if (catalogsStart < 0 || manifestStart < 0) throw new Error('server catalogs block not found');

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
    type: 'series',
    id: 'filmovenovinky-tipy-serialy',
    name: 'FilmovéNovinky – Tipy na seriál',
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

  src = src.slice(0, catalogsStart) + catalogs + src.slice(manifestStart);

  src = src.replace("const ADDON_VERSION = process.env.npm_package_version || '3.7.12';", "const ADDON_VERSION = process.env.npm_package_version || '3.7.16';");
  src = src.replace("  name: 'FilmovéNovinky CZ/SK filmy',", "  name: 'FilmovéNovinky CZ/SK filmy a seriály',");
  src = src.replace(
    "  description: 'Jeden katalóg CZ/SK dabovaných filmov z FilmovéNovinky.sk. Cache sa ukladá do GitHub repozitára.',",
    "  description: 'CZ/SK filmy a tipy na filmy aj seriály z FilmovéNovinky.sk. Cache sa ukladá do GitHub repozitára.',"
  );
  src = src.replace(
    "    { name: 'meta', types: ['movie'], idPrefixes: ['tt', 'filmovenovinky:'] }",
    "    { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt', 'filmovenovinky:'] }"
  );
  src = src.replace("  types: ['movie'],", "  types: ['movie', 'series'],");
  src = src.replace(
    "function typeOk(type) {\n  return type === 'movie';\n}",
    "function typeOk(type) {\n  return type === 'movie' || type === 'series';\n}"
  );
  src = src.replace('<h1>FilmovéNovinky CZ/SK filmy</h1>', '<h1>FilmovéNovinky CZ/SK filmy a seriály</h1>');
  src = src.replace(
    '<p>Katalógy: CZ/SK filmy, Tipy na film, Najlepšie hodnotené</p>',
    '<p>Katalógy: CZ/SK filmy, Tipy na film, Tipy na seriál, Najlepšie hodnotené</p>'
  );

  if (!src.includes("id: 'filmovenovinky-tipy-serialy'") || !src.includes("types: ['movie', 'series']")) {
    throw new Error('server series manifest patch failed');
  }

  write(file, src);
}

function patchPackage() {
  const file = 'package.json';
  const pkg = JSON.parse(read(file));
  pkg.version = '3.7.16';
  pkg.description = 'FilmoveNovinky addon with CZ/SK latest movies plus separate movie and series tip catalogs, metadata overrides, diagnostics and strict Stremio/Nuvio/Fusion metadata normalization.';
  write(file, JSON.stringify(pkg, null, 2) + '\n');
}

patchScrape();
patchCatalog();
patchServer();
patchPackage();
console.log('Tip movie + series catalog patch applied.');
