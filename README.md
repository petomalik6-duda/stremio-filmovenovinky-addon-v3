# FilmovéNovinky refresh-cache repair balík

Tento balík pridá opravy priamo do `refresh-cache` procesu.

Rieši dva prípady:

## 1. Chýba TMDB detail

Film je v cache, ale nemá `tmdbId`, poster alebo popis.

## 2. Chýba stream source

Typický problém:

```json
{
  "name": "Barvy zla: Černá",
  "sourceUrl": "https://www.filmovenovinky.sk/nove-filmy/...",
  "detailUrl": null,
  "csfdUrl": "https://www.csfd.cz/sk/film/..."
}
```

Film má ČSFD/TMDB detail, ale stream nenájde, lebo chýba `detailUrl`.

## Ako nahrať

1. Skopíruj do projektu priečinok `scripts`.
2. V `package.json` pridaj script podľa `PATCH-package.json.txt`.
3. Workflow môžeš nahradiť súborom `.github/workflows/refresh-cache.yml`, alebo si z neho skopíruj iba krok:

```yaml
- name: Refresh cache with TMDB and stream repair
  env:
    TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}
    REPAIR_TMDB_LIMIT: "300"
    REPAIR_STREAM_LIMIT: "300"
  run: npm run refresh-cache
```

## Ako to funguje

`scripts/refresh-cache-with-repair.js` spraví:

```txt
1. spustí pôvodný scripts/refresh-cache.js
2. spustí TMDB repair
3. spustí detailUrl / stream source repair
4. uloží cache
```

## Dôležité

Ak máš cache pod iným názvom ako `data/cache.json`, uprav buď env:

```txt
CACHE_FILE=data/tvoj-subor.json
```

alebo zoznam ciest v:

```txt
scripts/repair-filmovenovinky-after-refresh.js
```

## Výsledok

Pri každom automatickom refresh-cache sa nové filmy hneď pokúsia opraviť, aby nezostali s:

```json
"detailUrl": null
```

alebo bez TMDB detailu.
