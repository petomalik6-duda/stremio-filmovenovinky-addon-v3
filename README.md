# FilmovéNovinky CZ/SK filmy – jeden katalóg

Táto verzia má v Stremiu iba jeden katalóg:

```text
FilmovéNovinky – CZ/SK filmy
```

Odstránené sú:

```text
Dabing CZ
Dabing SK
Dabing CZ/SK
Top hodnotené
Nové seriály
Top seriály
```

## Nastavenie Render Environment

Použi:

```env
PORT=10000
PUBLIC_URL=https://tvoja-sluzba.onrender.com
AUTO_REFRESH=false
REFRESH_ON_START=false
CACHE_TTL_HOURS=24

MAX_ITEMS=1000
MAX_SERIES=0
DISABLE_SERIES=true

ENRICH_LIMIT=0
ENABLE_TMDB=false
CSFD_SEARCH_FALLBACK=false

REQUEST_TIMEOUT_MS=15000
HTTP_RETRIES=1
REFRESH_LOCK_TIMEOUT_MS=180000
USE_READER_FALLBACK=true

MOVIES_SOURCE_URL=https://www.filmovenovinky.sk/nove-filmy/nove-filmy-s-dabingom-cz-sk-zistite-co-pribudlo-dnes
SERIES_SOURCE_URL=
```

## Po deployi

V Renderi daj:

```text
Manual Deploy → Clear build cache & deploy
```

Potom otvor:

```text
https://tvoja-sluzba.onrender.com/refresh
```

Sleduj:

```text
https://tvoja-sluzba.onrender.com/stats
```

Katalóg:

```text
https://tvoja-sluzba.onrender.com/catalog/movie/filmovenovinky-filmy.json
```

Manifest do Stremia:

```text
https://tvoja-sluzba.onrender.com/manifest.json
```

## Poznámka

TMDB metadata sú zatiaľ vypnuté kvôli rýchlosti pri veľkom počte filmov. Keď bude katalóg plný, môžeš ich zapnúť postupne cez:

```env
ENABLE_TMDB=true
TMDB_API_KEY=tvoj_kluc
ENRICH_LIMIT=25
```
