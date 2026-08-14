# 3.7.3 – Verified edge cases

Táto verzia nemení globálnu toleranciu fuzzy matchera. Posledné tri problematické položky rieši cez stabilné ČSFD ID a ručne overené externé identifikátory:

- ČSFD 1389729 – Alej velikánů / Avenue of the Giants / The Optimist → TMDB 1129188, IMDb tt27803347.
- ČSFD 1633561 – Kukang Movie → IMDb tt37039145 + faktický dokumentárny popis, ak provider popis neposkytne.
- ČSFD 1767154 – Jánošík (2025) → divadelný záznam, preto sa v movie katalógu vylúči.

Používa sa samostatná `sourceOverrideVersion`, takže nie je potrebné zvýšiť globálny MATCH_VERSION a prepočítavať všetkých ~800 položiek. Bežný incremental refresh opraví iba dotknuté edge cases.
