export function normalizeTitle(value) {
  return String(value || '')
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

export function titleMatchScore(query, name, originalName) {
  const q = normalizeTitle(query);
  if (!q) return 0;

  const names = [...new Set([
    normalizeTitle(name),
    normalizeTitle(originalName),
  ].filter(Boolean))];

  let best = 0;

  for (const candidate of names) {
    if (candidate === q) {
      best = Math.max(best, 100);
      continue;
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
