# 3.6.2 – Nuvio/Fusion detail routing fix

## Root cause
The addon advertised `meta` only as a plain string in `manifest.resources`.
Some clients can then prefer/route metadata through their global IMDb/Cinemeta provider instead of querying this addon's `/meta` resource. For titles not yet available in that provider, the catalog item exists but the detail page can be empty.

## Fix
The manifest now explicitly advertises metadata capability for movie IDs:

```js
resources: [
  'catalog',
  { name: 'meta', types: ['movie'], idPrefixes: ['tt', 'filmovenovinky:'] }
]
```

This tells clients that this addon itself provides metadata for both IMDb IDs and legacy/local FilmovéNovinky IDs.

The previous local-ID alias protection remains in place.

## Important after deploy
Because the manifest changed, reinstall/re-add the addon URL in Nuvio/Fusion so the client reloads the manifest instead of using its cached copy.
