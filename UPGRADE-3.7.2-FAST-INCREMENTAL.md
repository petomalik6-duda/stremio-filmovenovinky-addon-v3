# 3.7.2 – Fast Incremental refresh

Incremental refresh používa najprv už známe externé ID:

1. `tmdbId` → priamy TMDB detail,
2. IMDb ID → TMDB find,
3. až pri zlyhaní ČSFD/Jina + title/year matcher.

Pri `force_full=true` zostáva dôkladná pôvodná cesta zachovaná. Scheduled workflow zostáva incremental (`force_full=false`).
