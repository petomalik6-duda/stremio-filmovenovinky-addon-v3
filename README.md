# FilmovéNovinky CZ/SK dabing+ Stremio addon v3.3 Fixed3

Táto verzia rieši chybu:

```json
"lastError": "timeout of 20000ms exceeded"
```

To znamená, že Render nevie načítať FilmovéNovinky priamo. Fixed3 preto robí:

1. skúsi priamo FilmovéNovinky.sk,
2. ak je timeout, použije textový reader fallback,
3. vie parsovať aj markdown/text zo stránky,
4. katalóg nečaká na refresh.

## Render Environment pre prvý test

```env
PORT=10000
PUBLIC_URL=https://tvoja-sluzba.onrender.com
AUTO_REFRESH=false
REFRESH_ON_START=false
CACHE_TTL_HOURS=24
MAX_ITEMS=120
MAX_SERIES=40
ENRICH_LIMIT=0
ENABLE_TMDB=false
CSFD_SEARCH_FALLBACK=false
REQUEST_TIMEOUT_MS=15000
HTTP_RETRIES=1
REFRESH_LOCK_TIMEOUT_MS=180000
USE_READER_FALLBACK=true
MOVIES_SOURCE_URL=https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes
SERIES_SOURCE_URL=https://www.filmovenovinky.sk/top-filmy/tipy-na-dobry-film-a-serial-s-dabingom-aj-s-titulkami
```

## Po deployi

Použi:

```text
Manual Deploy → Clear build cache & deploy
```

Potom otvor:

```text
/refresh
```

a sleduj:

```text
/stats
```

Ak je `stage: done` a `items > 0`, Stremio katalóg už pôjde.

## Endpointy

```text
/health
/stats
/refresh
/refresh-now
/catalog/movie/filmovenovinky-dabing.json
/catalog/series/filmovenovinky-serialy.json
```
