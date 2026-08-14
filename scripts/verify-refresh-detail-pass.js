import assert from 'node:assert/strict';
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const cmd = pkg.scripts?.['refresh-cache-with-safe-repair'] || '';
assert.match(cmd, /postprocess-cache\.js/);
assert.match(cmd, /repair-details-after-postprocess\.js/);
console.log(JSON.stringify({ ok: true, command: cmd }, null, 2));
