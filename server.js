import 'dotenv/config';
import express from 'express';
import { filterCatalog, getCatalog, getCatalogStats, getMetaById, refreshCache, searchCatalog } from './src/catalog.js';

const PORT = Number(process.env.PORT || 7000);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const AUTO_REFRESH = String(process.env.AUTO_REFRESH || 'true').toLowerCase() !== 'false';
const AUTO_REFRESH_MINUTES = Math.max(15, Number(process.env.AUTO_REFRESH_MINUTES || 360));

const baseCatalogs = [
  { id: 'filmovenovinky-dabing', name: 'Nové dabované CZ/SK' },
  { id: 'filmovenovinky-cz', name: 'Dabing CZ' },
  { id: 'filmovenovinky-sk', name: 'Dabing SK' },
  { id: 'filmovenovinky-czsk', name: 'Dabing CZ/SK' },
  { id: 'filmovenovinky-top', name: 'Top hodnotené' }
];

const catalogs = [
  ...baseCatalogs.map(c => ({ type: 'movie', ...c })),
  { type: 'series', id: 'filmovenovinky-serialy', name: 'Nové seriály' },
  { type: 'series', id: 'filmovenovinky-top', name: 'Top seriály' }
].map(c => ({ ...c, extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }] }));

const manifest = {
  id: 'sk.filmovenovinky.dabing.v3',
  version: '3.0.0',
  name: 'FilmovéNovinky CZ/SK dabing+',
  description: 'Katalóg CZ/SK dabovaných filmov a seriálov z FilmovéNovinky.sk. Česká TMDB lokalizácia, cache, auto-refresh, ČSFD/IMDb/TMDB a fulltext vyhľadávanie.',
  logo: `${PUBLIC_URL}/logo.png`,
  resources: ['catalog', 'meta'],
  types: ['movie', 'series'],
  catalogs,
  idPrefixes: ['tt', 'filmovenovinky:'],
  behaviorHints: { configurable: false }
};

const app = express();
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); next(); });
app.use(express.json());
app.use('/logo.png', express.static('logo.png'));

function cleanMeta(meta) { if (!meta) return null; const { _addon, ...safeMeta } = meta; return safeMeta; }
function parseExtra(extraRaw = '') { const extra = {}; if (!extraRaw) return extra; for (const part of String(extraRaw).split('&')) { const [key, value = ''] = part.split('='); if (key) extra[decodeURIComponent(key)] = decodeURIComponent(value); } return extra; }
function typeOk(type) { return type === 'movie' || type === 'series'; }
function catalogOk(type, id) { return catalogs.some(c => c.type === type && c.id === id); }

async function catalogResponse(type, id, extra = {}) {
  if (!typeOk(type) || !catalogOk(type, id)) return { metas: [] };
  const skip = Math.max(0, Number(extra.skip || 0));
  let metas = filterCatalog(await getCatalog(), id, type);
  metas = searchCatalog(metas, extra.search || '');
  return { metas: metas.slice(skip, skip + 100).map(cleanMeta) };
}

app.get('/', (_req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (_req, res) => res.json(manifest));
app.get('/catalog/:type/:id.json', async (req, res, next) => { try { res.json(await catalogResponse(req.params.type, req.params.id, req.query)); } catch (e) { next(e); } });
app.get('/catalog/:type/:id/:extra.json', async (req, res, next) => { try { res.json(await catalogResponse(req.params.type, req.params.id, parseExtra(req.params.extra))); } catch (e) { next(e); } });
app.get('/meta/:type/:id.json', async (req, res, next) => { try { if (!typeOk(req.params.type)) return res.json({ meta: null }); const meta = await getMetaById(req.params.id); res.json({ meta: meta?.type === req.params.type ? cleanMeta(meta) : null }); } catch (e) { next(e); } });
app.get('/search/:type/:query.json', async (req, res, next) => { try { const metas = searchCatalog(filterCatalog(await getCatalog(), 'filmovenovinky-dabing', req.params.type), req.params.query); res.json({ metas: metas.slice(0, 100).map(cleanMeta) }); } catch (e) { next(e); } });
app.get('/health', async (_req, res) => { const stats = await getCatalogStats().catch(e => ({ error: e.message })); res.json({ ok: true, version: manifest.version, autoRefresh: AUTO_REFRESH, refreshMinutes: AUTO_REFRESH_MINUTES, ...stats }); });
app.get('/stats', async (_req, res, next) => { try { res.json(await getCatalogStats()); } catch (e) { next(e); } });
app.get('/refresh', async (req, res, next) => { try { const forceFull = req.query.full === '1' || req.query.full === 'true'; const metas = await refreshCache({ forceFull }); res.json({ ok: true, full: forceFull, items: metas.length, stats: await getCatalogStats() }); } catch (e) { next(e); } });
app.get('/cache.json', async (_req, res, next) => { try { const metas = await getCatalog(); res.json({ items: metas.length, metas }); } catch (e) { next(e); } });

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ ok: false, error: err.message }); });
app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
  if (AUTO_REFRESH) {
    setTimeout(() => refreshCache().catch(e => console.error('Initial refresh failed:', e.message)), 2000);
    setInterval(() => refreshCache().catch(e => console.error('Auto refresh failed:', e.message)), AUTO_REFRESH_MINUTES * 60 * 1000);
  }
});
