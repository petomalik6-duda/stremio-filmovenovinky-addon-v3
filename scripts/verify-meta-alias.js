import { buildMetaIndex, localStremioId } from '../src/ids.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fixtures = [
  {
    item: {
      type: 'movie', name: "My Mother's Wedding", originalName: '', year: '2023', lang: 'CZ',
      key: "movie|my mother's wedding||2023|cz"
    },
    meta: { id: 'tt20911974', name: "My Mother's Wedding", _addon: { key: "movie|my mother's wedding||2023|cz", imdbId: 'tt20911974' } }
  },
  {
    item: {
      type: 'movie', name: 'Sčítání', originalName: 'Addition', year: '2024', lang: 'CZ',
      key: 'movie|sčítání|addition|2024|cz'
    },
    meta: { id: 'tt27722524', name: 'Sčítání', _addon: { key: 'movie|sčítání|addition|2024|cz', imdbId: 'tt27722524' } }
  }
];

const items = fixtures.map(x => x.item);
const metas = fixtures.map(x => x.meta);
const index = buildMetaIndex(metas, items);
const checks = [];

for (const { item, meta } of fixtures) {
  const localId = localStremioId(item);
  assert(index.get(meta.id) === meta, `IMDb ID ${meta.id} musí smerovať na metadata.`);
  assert(index.get(localId) === meta, `Staré lokálne ID pre ${item.name} musí smerovať na nové IMDb metadata.`);
  checks.push({ name: item.name, imdbId: meta.id, localId, aliasResolved: true });
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
