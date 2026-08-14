# 3.7.0 – Matcher v3 + CSFD reader fallback

This release targets the final unmatched FilmovéNovinky titles rather than adding more description fallbacks.

- MATCH_VERSION 3 forces unmatched/old metadata to be reconsidered.
- TMDB matching now uses alternative titles and fuzzy edit similarity for small spelling/localization variants.
- Superscript digits are normalized (for example The Accountant² ↔ The Accountant 2).
- CSFD title is added as an additional candidate.
- When direct CSFD access is blocked, Jina Reader is used as a fallback to recover IMDb ID, title, poster, description and genres.
- Movie-only mode checks TMDB TV only after movie matching fails and hides strong TV matches from the movie catalog.
- /stats now exposes poorMetadataExamples and excludedExamples for deterministic troubleshooting.
