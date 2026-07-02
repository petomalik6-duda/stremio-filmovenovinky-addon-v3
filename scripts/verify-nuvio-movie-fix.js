import fs from 'node:fs';

const cache = JSON.parse(fs.readFileSync(new URL('../data/catalog-cache.json', import.meta.url), 'utf8'));
const movies = (cache.metas || []).filter(meta => meta?.type === 'movie');
const invalid = movies.filter(meta =>
  Object.prototype.hasOwnProperty.call(meta, 'videos') ||
  Object.prototype.hasOwnProperty.call(meta, 'seriesInfo') ||
  Object.prototype.hasOwnProperty.call(meta, 'season') ||
  Object.prototype.hasOwnProperty.call(meta, 'episode') ||
  meta?.behaviorHints?.defaultVideoId !== meta.id
);
const prada = movies.find(meta => /pradu 2/i.test(meta.name || '') || /devil wears prada 2/i.test(meta.description || ''));

if (!prada) throw new Error('Testovací film Ďábel nosí Pradu 2 nebol nájdený v cache.');
if (prada.type !== 'movie') throw new Error(`Nesprávny type pre Prada 2: ${prada.type}`);
if (invalid.length) {
  throw new Error(`Našlo sa ${invalid.length} filmov so seriálovými/video poliami: ${invalid.slice(0, 5).map(x => x.name).join(', ')}`);
}

console.log(JSON.stringify({
  ok: true,
  movies: movies.length,
  testedTitle: prada.name,
  type: prada.type,
  id: prada.id,
  videosPresent: Object.prototype.hasOwnProperty.call(prada, 'videos')
}, null, 2));
