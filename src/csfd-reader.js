function clean(text = '') { return String(text || '').replace(/\s+/g, ' ').trim(); }

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

export function parseCsfdReaderText(text = '') {
  const source = String(text || '');
  const imdbId = source.match(/imdb\.com\/title\/(tt\d{7,10})/i)?.[1] || null;
  const title = firstNonEmpty(
    source.match(/^Title:\s*(.+?)(?:\s*\|\s*ČSFD.*)?$/mi)?.[1],
    source.match(/^#\s+(.+?)$/m)?.[1]
  );
  const year = source.match(/\b(19\d{2}|20\d{2})\b/)?.[1] || null;
  const poster = source.match(/https?:\/\/[^\s)\]]*(?:image\.pmgstatic\.com|img\.csfd\.cz)[^\s)\]]*/i)?.[0] || null;

  let description = '';
  const contentMatch = source.match(/(?:^|\n)(?:#{1,6}\s*)?(?:Obsahy|Obsah)(?:\([^)]*\))?\s*\n+([\s\S]{20,2000}?)(?=\n#{1,6}\s|\n\s*\*\s*\*\s*\*|\n\s*(?:Recenze|Zajímavosti|Videa|Galerie|Hrají|Ocenění|Filmotéka|Diskuze)\b|$)/i);
  if (contentMatch) {
    description = clean(contentMatch[1]
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[[^\]]+\]\([^)]*\)/g, ' ')
      .replace(/^[-*•]+\s*/gm, ' '));
  }

  const genreLine = source.split(/\r?\n/).map(clean).find(line =>
    /^(?:Akční|Animovaný|Dobrodružný|Dokumentární|Drama|Fantasy|Historický|Horor|Hudební|Komedie|Krimi|Mysteriózní|Rodinný|Romantický|Sci-Fi|Sportovní|Thriller|Válečný|Western)(?:\s*\/\s*[\p{L}-]+)+$/iu.test(line)
  );
  const genres = genreLine ? genreLine.split('/').map(clean).filter(Boolean) : [];

  return { imdbId, title, csfdYear: year, poster, description, genres };
}
