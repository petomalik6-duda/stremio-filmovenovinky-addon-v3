import { mergeTmdbLanguageFallback } from '../src/tmdb-language-fallback.js';

const primary = {
  id: 123,
  title: 'Český názov',
  overview: '',
  poster_path: '/cz.jpg',
  backdrop_path: '/bg.jpg'
};
const fallback = {
  id: 123,
  title: 'English title',
  overview: 'This is a sufficiently long English overview used only when the localized overview is missing.',
  poster_path: '/en.jpg',
  backdrop_path: '/enbg.jpg'
};

const merged = mergeTmdbLanguageFallback(primary, fallback, 'movie');
if (merged.title !== 'Český názov') throw new Error('Localized title was overwritten');
if (merged.overview !== fallback.overview) throw new Error('Fallback overview was not used');
if (merged.poster_path !== '/cz.jpg') throw new Error('Localized poster was overwritten');
if (merged.backdrop_path !== '/bg.jpg') throw new Error('Localized backdrop was overwritten');

const goodPrimary = { ...primary, overview: 'Toto je dostatočne dlhý lokalizovaný popis filmu, ktorý sa nemá prepísať.' };
const goodMerged = mergeTmdbLanguageFallback(goodPrimary, fallback, 'movie');
if (goodMerged.overview !== goodPrimary.overview) throw new Error('Valid localized overview was overwritten');

console.log('TMDB language fallback test passed.');
