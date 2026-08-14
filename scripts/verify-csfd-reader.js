import { parseCsfdReaderText } from '../src/csfd-reader.js';
const sample = `Title: Sheriffovo zlato (2024) | ČSFD.cz\n\n# Sheriffovo zlato\n\nWestern / Komedie\n\nČesko, 2024, 90 min\n\n### Obsahy(1)\nPříběh o hledání ztraceného zlata režiséra Pavla Holého vás zavede do legendárního města Keen Town.\n\n### Recenze\n`;
const out = parseCsfdReaderText(sample);
if (out.csfdYear !== '2024') throw new Error('year');
if (!out.description.includes('Příběh o hledání')) throw new Error('description');
if (!out.genres.includes('Western') || !out.genres.includes('Komedie')) throw new Error('genres');
console.log('csfd reader parser OK');
