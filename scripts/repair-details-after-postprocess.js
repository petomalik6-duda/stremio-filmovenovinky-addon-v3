import 'dotenv/config';
import { refreshCache, getCatalogStats } from '../src/catalog.js';

try {
  console.log('[detail-repair] Starting incremental metadata detail repair after postprocess...');
  const metas = await refreshCache({ forceFull: false });
  const stats = await getCatalogStats();
  console.log('[detail-repair] Done. Items:', metas.length);
  console.log('[detail-repair] Stats:', JSON.stringify(stats, null, 2));
  process.exit(0);
} catch (error) {
  console.error('[detail-repair] failed:', error);
  process.exit(1);
}
