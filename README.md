# FilmovéNovinky CZ/SK dabing+ Stremio addon v3.1 Fixed

Táto verzia opravuje hlavný problém v3:

- katalógové endpointy už nečakajú na dlhý scraper,
- `/refresh` odpovie hneď a refresh beží na pozadí,
- `getCatalog()` servíruje uloženú cache,
- scraper už nevráti 0 len preto, že web zmenil dátumové nadpisy,
- Render port je predvolene `10000`,
- TMDB a ČSFD search fallback sú predvolene vypnuté, aby refresh netrval príliš dlho.

## Render nastavenia

Build command:

```bash
npm install --omit=dev
```

Start command:

```bash
npm start
```

Environment variables:

```env
PORT=10000
PUBLIC_URL=https://tvoja-sluzba.onrender.com
AUTO_REFRESH=false
REFRESH_ON_START=false
CACHE_TTL_HOURS=24
MAX_ITEMS=250
MAX_SERIES=80
ENRICH_LIMIT=25
ENABLE_TMDB=false
CSFD_SEARCH_FALLBACK=false
REQUEST_TIMEOUT_MS=60000
HTTP_RETRIES=2
```

Keď bude základný katalóg fungovať, môžeš zapnúť TMDB:

```env
ENABLE_TMDB=true
TMDB_API_KEY=tvoj_tmdb_kluc
ENRICH_LIMIT=25
```

## Kontrola

```text
/health
/stats
/refresh
/refresh-now
/cache.json
/catalog/movie/filmovenovinky-dabing.json
/catalog/series/filmovenovinky-serialy.json
```

## Dôležité

Po deployi otvor:

```text
https://tvoja-sluzba.onrender.com/refresh
```

Potom sleduj:

```text
https://tvoja-sluzba.onrender.com/stats
```

Keď `items` bude viac ako 0, katalóg v Stremiu začne zobrazovať položky.
