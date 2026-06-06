# FilmovéNovinky CZ/SK dabing+ Stremio addon v3.2 Fixed2

Táto verzia rieši stav:

```json
{"at":0,"refreshRunning":true,"items":0}
```

Hlavné zmeny:

- refresh má lock timeout a nemôže visieť donekonečna,
- `/stats` ukazuje `stage`, `refreshStartedAt`, `refreshAgeSeconds`,
- `ENRICH_LIMIT=0` je default, takže sa nepúšťajú pomalé CSFD/TMDB volania,
- scraper loguje sťahovanie stránok,
- request timeout je znížený na 20s, aby sa chyba ukázala skôr.

## Render Environment

Použi presne toto na prvý test:

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
REQUEST_TIMEOUT_MS=20000
HTTP_RETRIES=1
REFRESH_LOCK_TIMEOUT_MS=180000
MOVIES_SOURCE_URL=https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes
SERIES_SOURCE_URL=https://www.filmovenovinky.sk/
```

## Po deployi

1. Reštartuj Render službu.
2. Otvor:

```text
https://tvoja-sluzba.onrender.com/refresh
```

3. Sleduj:

```text
https://tvoja-sluzba.onrender.com/stats
```

Ak `stage` zostane na `scrape-filmovenovinky`, Render nevie stiahnuť FilmovéNovinky.sk.
Ak `stage` bude `scraped-0-items`, zmenila sa HTML štruktúra alebo URL.
Ak `stage` bude `done`, katalóg je hotový.

## Katalóg

```text
/catalog/movie/filmovenovinky-dabing.json
/catalog/series/filmovenovinky-serialy.json
```
