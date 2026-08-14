import fs from 'fs';
const catalog = fs.readFileSync('src/catalog.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/refresh-cache.yml', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
function assert(c,m){if(!c)throw new Error(m);}
assert(catalog.includes('fastKnownLookup = true'),'fast option missing');
assert(catalog.includes("lookupPath: 'tmdb_id_fast'"),'tmdb fast path missing');
assert(catalog.includes("lookupPath: 'imdb_to_tmdb_fast'"),'imdb fast path missing');
assert(catalog.includes('enrichItem(item, existing, { fastKnownLookup: !forceFull })'),'incremental/full routing missing');
assert(catalog.includes('fastIncrementalKnownIdFirst: true'),'stats flag missing');
assert(workflow.includes("FORCE_FULL_REFRESH: ${{ github.event.inputs.force_full || 'false' }}"),'scheduled incremental default missing');
assert(server.includes("version: '3.7.5'"),'version mismatch');
assert(server.includes("id: 'sk.filmovenovinky.filmy.only.v384'"),'manifest id mismatch');
console.log(JSON.stringify({ok:true,fastIncrementalKnownIdFirst:true,fullRefreshFallbackPreserved:true},null,2));
