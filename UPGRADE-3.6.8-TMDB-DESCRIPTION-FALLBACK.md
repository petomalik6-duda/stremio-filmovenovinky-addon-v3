# 3.6.8 – TMDB description language fallback

`poorMetadata` remained high because many matched movies had posters/backdrops and valid TMDB IDs, but TMDB returned an empty or very short `overview` for `cs-CZ`.

3.6.8 keeps the localized Czech title and images, but if the localized overview is missing it fetches the same TMDB detail once more with `TMDB_FALLBACK_LANGUAGE` (default `en-US`) and uses only the missing description. This allows the existing dedicated detail repair pass to complete those records instead of retrying them forever.

`/stats` now also exposes `poorMissingPoster`, `poorMissingBackground`, and `poorMissingDescription`, plus the configured TMDB primary/fallback languages.
