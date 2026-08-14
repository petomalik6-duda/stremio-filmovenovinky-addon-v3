# 3.7.5 – Cross-client movie stream bridge

Keeps FilmovéNovinky-owned metadata IDs while exposing exactly one movie `videos` entry whose ID is the verified IMDb ID. `behaviorHints.defaultVideoId` points to the same video. This gives Stremio-compatible clients an explicit video identifier for querying external tt-prefixed stream addons.

The bridge never exposes trailer or episode videos and never adds season/episode fields. Unmatched local-ID movies keep no `videos` array.
