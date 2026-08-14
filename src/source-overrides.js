function csfdIdFromUrl(value) {
  const match = String(value || '').match(/\/film\/(\d+)(?:-|\/|$)/i);
  return match?.[1] || null;
}

// Ručne overené edge cases zo zdroja FilmovéNovinky/ČSFD.
// Sú zámerne viazané na stabilné ČSFD ID, nie iba na názov, aby nemohli
// ovplyvniť iný film s podobným názvom.
const VERIFIED_SOURCE_OVERRIDES = new Map([
  ['1389729', {
    version: 1,
    tmdbId: 1129188,
    imdbId: 'tt27803347',
    aliases: ['Avenue of the Giants', 'The Optimist', 'The Optimist: The Bravest Act Is Truth']
  }],
  ['1767154', {
    version: 1,
    excludedReason: 'csfd_theatre_recording'
  }],
  ['1633561', {
    version: 1,
    imdbId: 'tt37039145',
    description: 'Časozberný dokument z roku 2023 sleduje ochranu outloňov v Indonézii, boj proti nelegálnemu obchodu so zvieratami a činnosť Záchranného programu Kukang. Réžia: Ondřej Smékal.',
    genres: ['Dokumentárny']
  }]
]);

export function getVerifiedSourceOverride(item) {
  const csfdId = csfdIdFromUrl(item?.csfdUrl);
  if (!csfdId) return null;
  const override = VERIFIED_SOURCE_OVERRIDES.get(csfdId);
  return override ? { ...override, csfdId } : null;
}

export function sourceOverrideNeedsMigration(item, meta) {
  const override = getVerifiedSourceOverride(item);
  if (!override) return false;
  return Number(meta?._addon?.sourceOverrideVersion || 0) < Number(override.version || 1);
}

export { csfdIdFromUrl };
