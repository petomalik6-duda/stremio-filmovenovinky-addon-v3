# 3.6.4 – strict metadata schema fix

Nuvio/Fusion can reject an entire meta response when a field has the wrong JSON type.
The previous cache stores `director` as a string, while the Stremio Meta schema requires an array of strings.

This release:
- normalizes `director`, `cast`, and `genres` to arrays of strings at response time;
- strips internal/non-standard fields such as `year` and `_addon` from public metadata;
- sanitizes link objects and behavior hints;
- changes future TMDB enrichment to store `director` as an array;
- keeps custom `filmovenovinky:` detail IDs and IMDb `defaultVideoId` for stream addons;
- bumps addon id/version to avoid stale client metadata caches.

A full refresh is not required because response-time normalization also fixes existing GitHub cache records.
