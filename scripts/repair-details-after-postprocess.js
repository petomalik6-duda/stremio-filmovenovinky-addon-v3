import 'dotenv/config';
import { repairIncompleteMetadata, getCatalogStats } from '../src/catalog.js';
import { getTmdbStatus } from '../src/tmdb.js';

try {
  console.log('[detail-repair] Starting dedicated metadata detail repair after postprocess...');
  const tmdb = getTmdbStatus();
  console.log('[detail-repair] TMDB status:', JSON.stringify(tmdb));

  if (tmdb.enabled && !tmdb.configured) {
    throw new Error('ENABLE_TMDB=true but TMDB_API_KEY is missing. Detail repair cannot fetch TMDB metadata.');
  }

  const result = await repairIncompleteMetadata({
    limit: Number(process.env.DETAIL_REPAIR_LIMIT || 100)
  });
  const stats = await getCatalogStats();
  console.log('[detail-repair] Result:', JSON.stringify(result, null, 2));
  console.log('[detail-repair] Stats:', JSON.stringify(stats, null, 2));
  process.exit(0);
} catch (error) {
  console.error('[detail-repair] failed:', error);
  process.exit(1);
}
