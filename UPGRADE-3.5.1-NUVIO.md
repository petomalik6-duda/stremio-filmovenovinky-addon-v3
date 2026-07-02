# FilmovéNovinky v3.5.1 – oprava Nuvio Android TV

## Oprava

- Filmy už neposielajú pole `videos` s YouTube trailerom.
- Trailer zostáva v `links` ako odkaz.
- Server pri každej odpovedi odstráni zo starých filmových metadata polia `videos`, `seriesInfo`, `season` a `episode`.
- Manifest má nové ID `sk.filmovenovinky.filmy.only.v371`, aby Nuvio nepoužilo starú cache.
- Oprava platí všeobecne pre všetky filmy.

## Nasadenie

1. Nahraj celý obsah balíka do GitHub repozitára.
2. Na Renderi spusti **Clear build cache & deploy**.
3. Over `/health`, verzia musí byť `3.5.1`.
4. V Nuvio odstráň starú verziu addonu a nainštaluj nový `/manifest.json`.
5. Úplne ukonči a znovu spusti Nuvio na Android TV.
