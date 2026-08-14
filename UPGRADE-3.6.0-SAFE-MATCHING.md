# 3.6.0 – bezpečnejšie párovanie filmov

Táto verzia opravuje prípady, keď sa nový film omylom priradil k staršiemu filmu/remaku s podobným názvom.

## Čo sa zmenilo

- ČSFD IMDb ID sa berie iba z explicitného odkazu `imdb.com/title/tt...`, nie z prvého `tt...` výskytu v celom HTML.
- TMDB kandidát musí mať dostatočne silnú zhodu názvu.
- TMDB kandidát s rokom mimo nastavenej tolerancie sa odmietne aj pri podobnom názve.
- Rok v katalógu sa drží podľa FilmovéNovinky; TMDB rok je uložený iba diagnosticky.
- Staré metadata majú `matchVersion` a postupne sa znovu overia aj pri nezmenenom zdroji.
- Pri dosiahnutí `ENRICH_LIMIT` sa staré metadata neprepíšu prázdnymi lokálnymi metadátami.
- Postprocess používa rovnaké bezpečnostné pravidlá a už nesmie znovu zaviesť chybný IMDb/TMDB match.

## Odporúčaný prvý refresh

Po nasadení spusti GitHub Actions workflow `Refresh FilmovéNovinky cache` s `force_full=true`.
Plný refresh prepočíta existujúcu cache novým matcherom.
