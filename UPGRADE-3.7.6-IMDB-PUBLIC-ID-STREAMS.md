# 3.7.6 — IMDb public IDs for streams

All matched movies now expose their IMDb `tt...` id as the public catalog/meta id. This restores compatibility with external stream addons that register `idPrefixes: ["tt"]`. The FilmovéNovinky addon still serves its own rich metadata for those IMDb ids, and the old `filmovenovinky:` ids remain valid aliases in the internal meta index. Movies without an IMDb id keep the local FilmovéNovinky id.

The temporary 3.7.5 `videos` bridge is removed to avoid movie-as-series regressions.
