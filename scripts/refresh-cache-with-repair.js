'use strict';

/**
 * FilmovéNovinky refresh-cache wrapper
 *
 * 1. spustí pôvodný scripts/refresh-cache.js
 * 2. opraví filmy bez TMDB detailu
 * 3. opraví filmy bez detailUrl / stream source
 * 4. uloží cache, aby workflow mohol commitnúť zmeny
 */

const path = require('path');
const { spawnSync } = require('child_process');

function tryRequire(modPath) {
  try { return require(modPath); } catch (_) { return null; }
}

async function runExistingRefresh() {
  const refreshPath = path.join(__dirname, 'refresh-cache.js');
  const mod = tryRequire(refreshPath);

  if (mod && typeof mod.refreshCache === 'function') {
    console.log('[refresh-cache-with-repair] Running exported refreshCache()...');
    return await mod.refreshCache();
  }
  if (mod && typeof mod.main === 'function') {
    console.log('[refresh-cache-with-repair] Running exported main()...');
    return await mod.main();
  }

  console.log('[refresh-cache-with-repair] Running scripts/refresh-cache.js as CLI...');
  const result = spawnSync(process.execPath, [refreshPath], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`Existing refresh-cache.js failed with exit code ${result.status}`);
  }
}

async function main() {
  await runExistingRefresh();

  const adapter = require('./repair-filmovenovinky-after-refresh');

  if (process.env.REPAIR_TMDB !== '0') {
    const limit = Number(process.env.REPAIR_TMDB_LIMIT || process.env.REPAIR_LIMIT || 300);
    console.log(`[refresh-cache-with-repair] Repairing TMDB metadata, limit=${limit}...`);
    const tmdb = await adapter.repairTmdbAfterRefresh({ limit });
    console.log('[refresh-cache-with-repair] TMDB repair:', JSON.stringify(tmdb, null, 2));
  }

  if (process.env.REPAIR_STREAMS !== '0') {
    const limit = Number(process.env.REPAIR_STREAM_LIMIT || process.env.REPAIR_LIMIT || 300);
    console.log(`[refresh-cache-with-repair] Repairing stream sources, limit=${limit}...`);
    const streams = await adapter.repairStreamsAfterRefresh({ limit });
    console.log('[refresh-cache-with-repair] Stream repair:', JSON.stringify(streams, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[refresh-cache-with-repair] failed:', err);
    process.exit(1);
  });
}

module.exports = { main };
