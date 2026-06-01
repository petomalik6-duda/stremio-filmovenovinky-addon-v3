# FilmovéNovinky CZ/SK dabing+ Stremio addon v3

Funkcie:
- filmy s CZ/SK dabingom
- seriálový katalóg z kategórie TV seriály / seriálových článkov
- česká lokalizácia TMDB (`TMDB_LANGUAGE=cs-CZ`)
- ČSFD → IMDb → TMDB párovanie pri filmoch
- TMDB párovanie pri seriáloch
- fulltext vyhľadávanie cez Stremio `search` extra
- cache do `data/catalog-cache.json`
- incremental refresh iba nových položiek
- automatický refresh cez `AUTO_REFRESH=true`

## Render

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
TMDB_API_KEY=xxxxx
PUBLIC_URL=https://tvoja-sluzba.onrender.com
NODE_VERSION=20
TMDB_LANGUAGE=cs-CZ
AUTO_REFRESH=true
AUTO_REFRESH_MINUTES=360
```

Manifest:
```text
https://tvoja-sluzba.onrender.com/manifest.json
```

Kontrola:
```text
/health
/stats
/refresh
/refresh?full=1
/catalog/movie/filmovenovinky-dabing.json
/catalog/series/filmovenovinky-serialy.json
```

Poznámka: Balík neobsahuje `node_modules` ani `package-lock.json`. Render si závislosti nainštaluje sám.

## K stream odkazom
Táto verzia nepridáva automatické Webshare/Sosáč streamy ani priame odkazy na neoficiálne zdroje. Metadata a katalógy sú pripravené tak, aby sa dali použiť s legálnymi stream providermi alebo s vlastným súkromným zdrojom právne dostupného obsahu.
