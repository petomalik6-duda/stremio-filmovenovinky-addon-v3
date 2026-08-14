# FilmovéNovinky 3.6.3 – vlastné metadata ID pre Nuvio/Fusion

## Prečo 3.6.2 nestačilo

Katalóg posielal IMDb ID (`tt...`) ako ID samotnej položky. Klient tak mohol detail
riešiť cez globálny IMDb/Cinemeta metadata provider namiesto metadata z FilmovéNovinky addonu.
Ak globálny provider titul ešte nemal, detail zostal prázdny aj napriek tomu, že náš cache
obsahoval kompletný poster, background, popis, hercov a TMDB/IMDb prepojenie.

## Oprava

- Katalóg a meta odpovede teraz používajú stabilné vlastné ID `filmovenovinky:...`.
- `behaviorHints.defaultVideoId` zostáva IMDb ID (`tt...`).
- Vďaka tomu detail poskytuje FilmovéNovinky addon, ale stream addony naďalej dostanú IMDb ID.
- Nepridáva sa pole `videos`, takže sa nevracia starý problém, keď Nuvio zobrazovalo film ako seriál.
- Staré `/meta/movie/tt....json` requesty ostávajú kompatibilné cez existujúci index aliasov.
- Manifest ID je nové `sk.filmovenovinky.filmy.only.v372`, aby sa obišla stará klientská cache.

## Overené tituly

- My Mother's Wedding -> IMDb tt20911974
- Sčítání / Addition -> IMDb tt27722524
