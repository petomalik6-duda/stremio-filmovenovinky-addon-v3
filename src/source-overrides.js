function csfdIdFromUrl(value) {
  const match = String(value || '').match(/\/film\/(\d+)(?:-|\/|$)/i);
  return match?.[1] || null;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/^[-*•\s]+/g, '')
    .replace(/\((CZ\/SK|SK\/CZ|CZ|SK)\)/ig, ' ')
    .replace(/\((19\d{2}|20\d{2})\)/g, ' ')
    .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
    .replace(/\s+-\s*(Netflix|Apple TV\+?|Prime Video|Disney\+?|HBO|Max).*$/i, ' ')
    .replace(/\s+IMDb\s+.*$/i, ' ')
    .replace(/\s+ČSFD\s+.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(value) {
  return cleanTitle(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemTitleVariants(item) {
  const values = [item?.name, item?.originalName, item?.titleRaw].filter(Boolean);
  const out = [];

  for (const value of values) {
    const cleaned = cleanTitle(value);
    if (!cleaned) continue;

    out.push(cleaned);
    if (cleaned.includes('/')) {
      for (const part of cleaned.split('/').map(x => x.trim()).filter(Boolean)) out.push(part);
    }
  }

  return [...new Set(out.map(normalizeTitle).filter(Boolean))];
}

function itemYearMatches(item, override) {
  const expected = String(override?.year || '').trim();
  if (!expected) return true;
  return String(item?.year || '').trim() === expected;
}

function withSideEffects(item, override, source) {
  if (!override) return null;

  // Dôležité: catalog.js používa item.csfdUrl pri skladaní links/description.
  // Ak FilmovéNovinky pri danej položke priamy ČSFD link nedá, doplníme ho
  // z overeného override ešte predtým, než sa zavolá toMeta().
  if (item && override.csfdUrl && !item.csfdUrl) item.csfdUrl = override.csfdUrl;

  return {
    ...override,
    csfdId: override.csfdId || csfdIdFromUrl(override.csfdUrl) || null,
    overrideSource: source
  };
}

// Ručne overené edge cases zo zdroja FilmovéNovinky/ČSFD.
// Primárne sú viazané na stabilné ČSFD ID. Pre prípady, kde zdrojový zoznam
// ČSFD link vôbec neobsahuje, máme bezpečný fallback podľa presných aliasov + roku.
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
  }],
  ['1690274', {
    version: 1,
    tmdbId: 1470334,
    imdbId: 'tt6930962',
    aliases: ['Spiked', 'Bodlinka: Pichlavé dobrodružství', 'Pichľavé dobrodružstvo']
  }],
  ['1700848', {
    version: 2,
    csfdId: '1700848',
    csfdUrl: 'https://www.csfd.sk/film/1700848-carodejnik-z-kremla/',
    tmdbId: 1291659,
    imdbId: 'tt32386654',
    aliases: [
      'Čarodejník z Kremľa',
      'Čarodejník z Kremľu',
      'Čaroděj z Kremlu',
      'The Wizard of the Kremlin',
      'Le Mage du Kremlin',
      'Le mage du Kremlin'
    ]
  }]
]);

const VERIFIED_TITLE_OVERRIDES = [
  {
    version: 2,
    year: '2025',
    csfdId: '1700848',
    csfdUrl: 'https://www.csfd.sk/film/1700848-carodejnik-z-kremla/',
    tmdbId: 1291659,
    imdbId: 'tt32386654',
    aliases: [
      'Čarodejník z Kremľa',
      'Čarodejník z Kremľu',
      'Čaroděj z Kremlu',
      'The Wizard of the Kremlin',
      'Le Mage du Kremlin',
      'Le mage du Kremlin'
    ]
  }
];

function findTitleOverride(item) {
  const variants = new Set(itemTitleVariants(item));
  if (!variants.size) return null;

  for (const override of VERIFIED_TITLE_OVERRIDES) {
    if (!itemYearMatches(item, override)) continue;
    const aliases = (override.aliases || []).map(normalizeTitle).filter(Boolean);
    if (aliases.some(alias => variants.has(alias))) return override;
  }

  return null;
}

export function getVerifiedSourceOverride(item) {
  const csfdId = csfdIdFromUrl(item?.csfdUrl);
  if (csfdId) {
    const override = VERIFIED_SOURCE_OVERRIDES.get(csfdId);
    if (override) return withSideEffects(item, { ...override, csfdId }, 'csfd_id');
  }

  const titleOverride = findTitleOverride(item);
  if (titleOverride) return withSideEffects(item, titleOverride, 'title_year_alias');

  return null;
}

export function sourceOverrideNeedsMigration(item, meta) {
  const override = getVerifiedSourceOverride(item);
  if (!override) return false;

  if (Number(meta?._addon?.sourceOverrideVersion || 0) < Number(override.version || 1)) return true;
  if (override.imdbId && meta?._addon?.imdbId !== override.imdbId) return true;
  if (override.tmdbId && Number(meta?._addon?.tmdbId || 0) !== Number(override.tmdbId)) return true;
  if (override.csfdUrl && meta?._addon?.csfdUrl !== override.csfdUrl) return true;

  return false;
}

export { csfdIdFromUrl };
