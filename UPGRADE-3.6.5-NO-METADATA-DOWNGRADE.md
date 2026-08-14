# 3.6.5 – metadata downgrade protection

Fixes a destructive refresh path discovered from the live Render response for `My Mother's Wedding`.

## Root cause

With `FORCE_FULL_REFRESH=true`, an already enriched cache record was re-enriched from scratch. If TMDB/ČSFD was unavailable, rate-limited, blocked, or the TMDB secret was missing/invalid, the refresh replaced the good IMDb/TMDB record with a local placeholder. That produced a valid `/meta` response, but only with a `placehold.co` poster and a local `defaultVideoId`.

## Fix

- `preferRicherMeta(existing, candidate)` prevents an external-match record from being replaced by a lower-quality placeholder.
- Exceptions during enrichment keep `existing` metadata even during full refresh.
- Successful future enrichment still upgrades placeholders.
- Version/manifest id bumped to `3.6.5` / `sk.filmovenovinky.filmy.only.v374`.
