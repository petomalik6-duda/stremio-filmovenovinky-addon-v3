# 3.6.1 – oprava chýbajúceho detailu filmu

Táto verzia rieši stav, keď film už bol neskôr správne spárovaný s IMDb/TMDB, ale Stremio/Nuvio stále požadovalo detail cez staré lokálne ID `filmovenovinky:...` a addon preto vrátil `meta: null`.

## Opravy

- server indexuje každý film pod aktuálnym IMDb ID aj pod pôvodným lokálnym ID,
- staré lokálne ID sa automaticky preloží na aktuálne bohaté metadata,
- lokálne placeholder metadata bez IMDb/TMDB sa pri ďalšom refreshe znovu skúšajú spárovať a nezostanú navždy bez info,
- opravená URL pre Jina Reader fallback pri blokovaní priameho načítania FilmovéNovinky,
- pridaný regresný test `verify-meta-alias.js`.

## Overené problematické filmy

- My Mother's Wedding (2023) (CZ) -> IMDb `tt20911974`, TMDB `985602`
- Sčítání / Addition (2024) (CZ) -> IMDb `tt27722524`, TMDB `1326036`

Aktuálny `data/catalog-cache.json` už pri oboch tituloch obsahuje popis, poster a ďalšie metadata. Po nasadení tejto verzie ich server vie vrátiť aj vtedy, keď klient použije staré lokálne ID.
