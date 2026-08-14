import fs from 'node:fs';
import { cleanPublicMeta } from '../src/public-meta.js';

const cache = JSON.parse(fs.readFileSync(new URL('../data/catalog-cache.json', import.meta.url), 'utf8'));

const cases = [
  ['tt20911974', "My Mother's Wedding"],
  ['tt27722524', 'Sčítání']
];

for (const [imdbId, expectedName] of cases) {
  const raw = (cache.metas || []).find(meta => meta?.id === imdbId || meta?._addon?.imdbId === imdbId);
  if (!raw) throw new Error(`Missing cache meta for ${imdbId}`);

  const meta = cleanPublicMeta(raw);
  if (!meta.id?.startsWith('filmovenovinky:')) {
    throw new Error(`${expectedName}: public metadata must use filmovenovinky: id, got ${meta.id}`);
  }
  if (meta.behaviorHints?.defaultVideoId !== imdbId) {
    throw new Error(`${expectedName}: defaultVideoId must remain ${imdbId}, got ${meta.behaviorHints?.defaultVideoId}`);
  }
  if (meta.name !== expectedName) {
    throw new Error(`${imdbId}: unexpected name ${meta.name}`);
  }
  if (!meta.poster || !meta.description || !meta.background) {
    throw new Error(`${expectedName}: incomplete public metadata`);
  }
  if (Object.prototype.hasOwnProperty.call(meta, '_addon')) {
    throw new Error(`${expectedName}: internal _addon leaked to client`);
  }
}

console.log(JSON.stringify({
  ok: true,
  strategy: 'custom metadata id + IMDb defaultVideoId',
  tested: cases.map(([id, name]) => ({ id, name }))
}, null, 2));
