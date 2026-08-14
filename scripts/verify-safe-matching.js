import {
  extractExplicitImdbIdFromHtml,
  titleMatchScore,
  yearMatches
} from '../src/matching.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const unrelatedIdHtml = `<html><body><main><h1>Jánošík</h1><script>window.related={"imdb":"tt0151169"}</script></main></body></html>`;
const explicitImdbHtml = `<html><body><main><a href="https://www.imdb.com/title/tt12345678/">IMDb</a></main></body></html>`;

assert(extractExplicitImdbIdFromHtml(unrelatedIdHtml) === null,
  'Parser nesmie zobrať náhodné tt ID zo scriptu/HTML.');
assert(extractExplicitImdbIdFromHtml(explicitImdbHtml) === 'tt12345678',
  'Parser musí zobrať explicitný IMDb href.');
assert(yearMatches(2025, 1936, 2) === false,
  'Matcher nesmie prijať film s rozdielom desiatok rokov.');
assert(yearMatches(2025, 2026, 2) === true,
  'Matcher má tolerovať bežný jednoročný posun premiéry.');
assert(yearMatches(2025, 2022, 2) === false,
  'Matcher nesmie prijať starší remake mimo tolerancie.');
assert(titleMatchScore('The Fantastic Four: First Steps', 'The Fantastic Four: First Steps', 'The Fantastic Four: First Steps') === 100,
  'Presný názov musí mať maximálne skóre.');
assert(titleMatchScore('The Fantastic Four', 'Fantastic Four', 'The Fantastic Four') >= 80,
  'Rozumná zhoda názvu musí prejsť titulovým filtrom.');

console.log(JSON.stringify({ ok: true, checks: 7, message: 'Safe ČSFD/TMDB matching checks passed.' }, null, 2));
