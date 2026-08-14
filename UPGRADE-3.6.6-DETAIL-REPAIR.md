# 3.6.6 – retry incomplete metadata details

Fixes a refresh gap where a movie with IMDb/TMDB IDs but placeholder poster/description was treated as fully matched and skipped on subsequent incremental refreshes.

Changes:
- metadata quality (poster/background/narrative description) is now part of rematch decision;
- known TMDB ID is reused directly before title search;
- known IMDb ID is reused if TMDB ID is unavailable;
- standalone TMDB repair now targets `cache.metas` before raw `cache.items`;
- existing richer metadata still wins over a failed/poorer refresh candidate.
