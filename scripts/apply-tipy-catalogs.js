import fs from 'fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }
function replaceRegex(content, regex, replacement, label) {
  const next = content.replace(regex, replacement);
  if (next === content) throw new Error('No change for ' + label);
  return next;
}

function patchCatalog() {
  const file = 'src/catalog.js';
  let src = read(file);

  src = src.replace(/const BEST_IMDB_MIN = Number\(process\.env\.BEST_IMDB_MIN \|\| [0-9.]+\);/, "const BEST_IMDB_MIN = Number(process.env.BEST_IMDB_MIN || 7.2);");
  src = src.replace(/const BEST_CSFD_MIN = Number\(process\.env\.BEST_CSFD_MIN \|\| [0-9.]+\);/, "const BEST_CSFD_MIN = Number(process.env.BEST_CSFD_MIN || 78);");

  if (!src.includes('function sortBestTipsByRating')) {
    src = replaceRegex(
      src,
      /function isBestRatedTip\(meta\) \{[\s\S]*?\n\}\n\nfunction sortByDateThenRating\(a, b\) \{[\s\S]*?\n\}\n\nexport function filterCatalog/,
      `function tipImdb(meta) {
  return numeric(meta?._addon?.tipImdbRating);
}

function tipCsfd(meta) {
  return numeric(meta?._addon?.tipCsfdPercent);
}

function tipScore(meta) {
  const csfd = tipCsfd(meta) ? tipCsfd(meta) / 10 : 0;
  const imdb = tipImdb(meta);
  return Math.max(csfd, imdb);
}

function isBestRatedTip(meta) {
  const imdb = tipImdb(meta);
  const csfd = tipCsfd(meta);

  // Najlepšie hodnotené má byť menší a odlišný výber zo sekcie Tipy.
  // Preto používame iba ratingy načítané zo stránky FilmovéNovinky, nie TMDB fallback.
  return imdb >= BEST_IMDB_MIN || csfd >= BEST_CSFD_MIN;
}

function sortTipsByDate(a, b) {
  const byDate = String(b._addon?.dateAdded || '').localeCompare(String(a._addon?.dateAdded || ''));
  if (byDate) return byDate;
  return String(a.name || '').localeCompare(String(b.name || ''), 'sk');
}

function sortBestTipsByRating(a, b) {
  const byScore = tipScore(b) - tipScore(a);
  if (byScore) return byScore;

  const byCsfd = tipCsfd(b) - tipCsfd(a);
  if (byCsfd) return byCsfd;

  const byImdb = tipImdb(b) - tipImdb(a);
  if (byImdb) return byImdb;

  return sortTipsByDate(a, b);
}

export function filterCatalog`,
      'catalog rating/sort block'
    );
  }

  if (src.includes('return arr.sort(sortByDateThenRating);')) {
    src = src.replace(
      '  return arr.sort(sortByDateThenRating);\n}',
      "  const sortFn = id === 'filmovenovinky-najlepsie' ? sortBestTipsByRating : sortTipsByDate;\n  return arr.sort(sortFn);\n}"
    );
  }

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
  pkg.version = '3.7.14';
  write(file, JSON.stringify(pkg, null, 2) + '\n');
}

patchCatalog();
patchPublicMeta();
patchPackage();
console.log('Tip catalog separation + poster fallback patch applied.');
