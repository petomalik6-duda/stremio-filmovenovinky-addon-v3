import { chooseTranslationOverview, buildFactualMetadataSummary } from '../src/tmdb-language-fallback.js';

const translations = {
  translations: [
    { iso_639_1: 'de', iso_3166_1: 'DE', data: { overview: 'Dies ist eine ausreichend lange deutsche Inhaltsangabe für den Test.' } },
    { iso_639_1: 'en', iso_3166_1: 'GB', data: { overview: 'This is a sufficiently long English UK overview selected before unrelated languages.' } },
    { iso_639_1: 'sk', iso_3166_1: 'SK', data: { overview: 'Toto je dostatočne dlhý slovenský popis filmu, ktorý má mať najvyššiu prioritu.' } }
  ]
};
const chosen = chooseTranslationOverview(translations, 'de');
if (!chosen.startsWith('Toto je')) throw new Error('SK translation was not preferred');

const noPreferred = {
  translations: [
    { iso_639_1: 'fr', iso_3166_1: 'FR', data: { overview: 'Une description française suffisamment longue pour servir de solution de secours.' } },
    { iso_639_1: 'pl', iso_3166_1: 'PL', data: { overview: 'Polski opis filmu wystarczająco długi do wykorzystania jako rozwiązanie awaryjne.' } }
  ]
};
if (!chooseTranslationOverview(noPreferred, 'pl').startsWith('Polski')) throw new Error('Original-language translation was not preferred');

const summary = buildFactualMetadataSummary({
  title: 'Test Movie',
  release_date: '2024-03-01',
  genres: [{ name: 'Drama' }, { name: 'Comedy' }],
  credits: {
    crew: [{ job: 'Director', name: 'Jane Director' }],
    cast: [{ name: 'Actor One' }, { name: 'Actor Two' }]
  }
}, 'movie');
if (!summary.includes('2024') || !summary.includes('Jane Director') || !summary.includes('Actor One')) {
  throw new Error('Factual summary is incomplete');
}
if (/dej|plot|príbeh/i.test(summary)) throw new Error('Factual summary should not fabricate plot text');

console.log('TMDB translations + factual summary fallback test passed.');
