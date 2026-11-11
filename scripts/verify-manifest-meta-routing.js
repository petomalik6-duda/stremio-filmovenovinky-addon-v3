import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const port = 19125;
const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), ADDON_ID: 'test.filmovenovinky', npm_package_version: pkg.version, AUTO_REFRESH: 'false', REFRESH_ON_START: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
child.stderr.on('data', chunk => { log += String(chunk); });
try {
  let manifest;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/manifest.json`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { manifest = await response.json(); break; }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(manifest, `Server failed to start: ${log}`);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.id, 'test.filmovenovinky');
  const meta = manifest.resources.find(r => typeof r === 'object' && r.name === 'meta');
  for (const type of ['movie', 'series']) assert.ok(meta.types.includes(type));
  for (const prefix of ['tt', 'tmdb:', 'filmovenovinky:']) assert.ok(meta.idPrefixes.includes(prefix));
  assert.ok(manifest.catalogs.some(c => c.type === 'series'));
  console.log('Live manifest routes movie/series metadata using standard and legacy IDs.');
} finally {
  child.kill('SIGTERM');
}
