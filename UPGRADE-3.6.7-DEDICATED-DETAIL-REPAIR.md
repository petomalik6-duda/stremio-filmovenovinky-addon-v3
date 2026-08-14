# 3.6.7 Dedicated detail repair

- Detail repair no longer depends on `ENRICH_LIMIT`.
- `/stats` exposes `tmdbEnabled`, `tmdbConfigured`, `enrichLimit`, and `detailRepairLimit` (never the API key).
- GitHub Actions fails clearly when `ENABLE_TMDB=true` but `TMDB_API_KEY` is missing.
- The postprocess repair pass targets only metadata that still have placeholder poster/background or no narrative description.
