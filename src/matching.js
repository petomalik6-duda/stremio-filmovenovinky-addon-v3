export function normalizeTitle(value) {
  return String(value || '')
    .replace(/[⁰₀]/g, ' 0 ')
    .replace(/[¹₁]/g, ' 1 ')
    .replace(/[²₂]/g, ' 2 ')
    .replace(/[³₃]/g, ' 3 ')
    .replace(/[⁴₄]/g, ' 4 ')
    .replace(/[⁵₅]/g, ' 5 ')
    .replace(/[⁶₆]/g, ' 6 ')
    .replace(/[⁷₇]/g, ' 7 ')
    .replace(/[⁸₈]/g, ' 8 ')
    .replace(/[⁹₉]/g, ' 9 ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value) {
  return new Set(String(value || '').split(' ').filter(Boolean));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function editSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - (levenshtein(a, b) / maxLen);
}

export function titleMatchScore(query, name, originalName, aliases = []) {
  const q = normalizeTitle(query);
  if (!q) return 0;

  const names = [...new Set([
    normalizeTitle(name),
    normalizeTitle(originalName),
    ...(Array.isArray(aliases) ? aliases.map(normalizeTitle) : []),
  ].filter(Boolean))];

  let best = 0;

  for (const candidate of names) {
    if (candidate === q) {
      best = Math.max(best, 100);
      continue;
    }

    // Toleruj drobné preklepy a lokalizačné varianty (Grand/Grande, Lesný/Lesní).
    // Krátke jednoslovné názvy zostávajú prísne, aby nevznikali falošné zhody.
    const similarity = editSimilarity(q, candidate);
    if (Math.min(q.length, candidate.length) >= 8) {
      if (similarity >= 0.94) best = Math.max(best, 94);
      else if (similarity >= 0.90) best = Math.max(best, 88);
      else if (similarity >= 0.86 && q.split(' ').length >= 2) best = Math.max(best, 82);
    }

    const overlap = jaccard(tokenSet(q), tokenSet(candidate));
    if (overlap >= 0.90) best = Math.max(best, 92);
    else if (overlap >= 0.80) best = Math.max(best, 86);
    else if (overlap >= 0.70) best = Math.max(best, 80);

    const shorter = q.length <= candidate.length ? q : candidate;
    if (
      shorter.length >= 12 &&
      shorter.split(' ').length >= 2 &&
      (candidate.includes(q) || q.includes(candidate))
    ) {
      best = Math.max(best, 82);
    }
  }

  return best;
}

export function yearMatches(expectedYear, candidateYear, tolerance = 2) {
  if (!expectedYear) return true;
  if (!candidateYear) return false;

  const expected = Number(expectedYear);
  const candidate = Number(candidateYear);
  if (!Number.isFinite(expected) || !Number.isFinite(candidate)) return false;

  return Math.abs(candidate - expected) <= Number(tolerance || 0);
}

export function extractExplicitImdbIdFromHtml(html) {
  const source = String(html || '');

  // Ber iba skutočný href smerujúci na IMDb titul. Náhodné "tt123..." v JSONe,
  // skriptoch, odporúčaniach alebo analytike sa ignorujú.
  const patterns = [
    /href\s*=\s*["'][^"']*imdb\.com\/title\/(tt\d{7,10})(?:\/|["'?#])/i,
    /href\s*=\s*["'][^"']*imdb\.com\/title\/(tt\d{7,10})/i,
  ];

  for (const pattern of patterns) {
    const id = source.match(pattern)?.[1];
    if (id) return id;
  }

  return null;
}
