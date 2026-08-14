import assert from 'node:assert/strict';
import fs from 'node:fs';
import { metaNeedsDetailRepair } from '../src/meta-quality.js';

const raw = JSON.parse(fs.readFileSync('data/catalog-cache.json', 'utf8'));
const metas = raw.metas || [];
const byName = new Map(metas.map(m => [m.name, m]));

assert.equal(metaNeedsDetailRepair(byName.get("My Mother's Wedding")), false, 'My Mother\'s Wedding should already be rich metadata');
assert.equal(metaNeedsDetailRepair(byName.get('Sčítání')), false, 'Sčítání should already be rich metadata');
assert.equal(metaNeedsDetailRepair(byName.get('Krokodýlí slzy')), true, 'Known TMDB id with placeholder poster must be retried');
assert.equal(metaNeedsDetailRepair(byName.get('Joe Baby')), true, 'Known TMDB id with placeholder detail must be retried');

const poor = metas.filter(metaNeedsDetailRepair);
assert.ok(poor.length > 0, 'Fixture should contain metadata that need repair');
console.log(JSON.stringify({ ok: true, poorMetadata: poor.length, examples: poor.slice(0, 10).map(m => m.name) }, null, 2));
