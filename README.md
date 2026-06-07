# FilmovéNovinky CZ/SK filmy – jeden katalóg + GitHub cache

Táto verzia rieši problém Renderu: cache v `data/catalog-cache.json` sa ukladá priamo do GitHub repozitára.

Aj keď Render zmaže disk alebo spravíš nový deploy, addon po štarte načíta poslednú commitnutú cache z repozitára.

## V Stremiu bude iba jeden katalóg

```text
FilmovéNovinky – CZ/SK filmy
```

## Render Environment

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

## GitHub Secret

V GitHube pridaj secret:

```text
TMDB_API_KEY
```

Cesta:

```text
Settings → Secrets and variables → Actions → New repository secret
```

## Ako uložiť aktuálnu cache z Renderu

Po nahratí tejto verzie do GitHubu choď na:

```text
Actions → Import cache from running addon URL → Run workflow
```

Do `cache_url` vlož:

```text
https://tvoja-sluzba.onrender.com/cache.json
```

Tým sa aktuálna cache z Renderu uloží do:

```text
data/catalog-cache.json
```

a commitne sa do GitHubu.

## Automatický denný refresh

Workflow:

```text
.github/workflows/refresh-cache.yml
```

beží 1× denne a commitne novú cache do GitHubu.

Manuálne ho spustíš cez:

```text
Actions → Refresh FilmovéNovinky cache → Run workflow
```

## Dôležité po dokončení obohatenia

Keď budeš mať dobré čísla, napríklad:

```text
items: 666
withTmdb: 600+
withImdb: 600+
```

spusti workflow:

```text
Import cache from running addon URL
```

Tým si uložíš hotovú obohatenú cache a Render ju už nestratí.

## Endpointy

```text
/manifest.json
/stats
/cache.json
/refresh
/catalog/movie/filmovenovinky-filmy.json
```


## Fix workflow bez package-lock

Vo workflow je odstránené:

```yaml
cache: npm
```

Preto GitHub Actions už nebude vyžadovať `package-lock.json`.


## Skryť filmy bez TMDB/IMDb/ČSFD

V Render Environment nastav:

```env
HIDE_UNMATCHED_ITEMS=true
```

Potom sa v Stremio katalógu zobrazia iba položky, ktoré majú aspoň jedno z týchto polí:

```text
tmdbId
imdbId
csfdUrl
```

Dôležité: táto verzia neobsahuje priečinok `data`, aby neprepísala tvoju existujúcu databázu/cache.


## Prísny filter iba na skutočné filmy

Pridané premenné:

```env
STRICT_MOVIE_FILTER=true
REQUIRE_YEAR_FOR_LOCAL_ITEMS=true
```

Filter odstraňuje položky typu menu, články, kategórie, reklamy alebo texty zo stránky. Lokálne položky bez TMDB/IMDb/ČSFD musia mať rok filmu.

Ak chceš v Stremiu zobrazovať iba filmy nájdené v TMDB/IMDb/ČSFD, nechaj:

```env
HIDE_UNMATCHED_ITEMS=true
```

Tento ZIP neobsahuje `data/`, takže neprepíše existujúcu cache.


## v3.5 oprava najnovších filmov bez detailu/streamu

Nové filmy na začiatku katalógu niekedy ostali s lokálnym ID:

```text
filmovenovinky:...
```

Preto nemali plný detail ani streamy. Táto verzia zlepšuje TMDB párovanie:

- skúša originálny názov aj lokálny názov,
- skúša názov aj bez presného roku,
- vyberá lepšieho TMDB kandidáta podľa názvu a roku,
- `/stats` pridáva `localIds`.

Po nasadení spusti:

```text
/refresh-now?full=1
```

a skontroluj, že `localIds` výrazne klesne.
