import assert from 'node:assert/strict';
import { getVerifiedSourceOverride, sourceOverrideNeedsMigration, csfdIdFromUrl } from '../src/source-overrides.js';

const avenue = { name: 'Alej velikánů', year: '2023', csfdUrl: 'https://www.csfd.cz/sk/film/1389729-alej-velikanu/prehlad/' };
const kukang = { name: 'Kukang Movie: Příběh o outloních a lidech', year: '2023', csfdUrl: 'https://www.csfd.cz/film/1633561-kukang-movie-pribeh-o-outlonich-a-lidech/prehled/' };
const janosik = { name: 'Jánošík', year: '2025', csfdUrl: 'https://www.csfd.cz/sk/film/1767154-janosik/prehlad/' };

assert.equal(csfdIdFromUrl(avenue.csfdUrl), '1389729');
assert.equal(getVerifiedSourceOverride(avenue)?.tmdbId, 1129188);
assert.equal(getVerifiedSourceOverride(avenue)?.imdbId, 'tt27803347');
assert.equal(getVerifiedSourceOverride(kukang)?.imdbId, 'tt37039145');
assert.ok((getVerifiedSourceOverride(kukang)?.description || '').length >= 20);
assert.equal(getVerifiedSourceOverride(janosik)?.excludedReason, 'csfd_theatre_recording');
assert.equal(sourceOverrideNeedsMigration(avenue, { _addon: {} }), true);
assert.equal(sourceOverrideNeedsMigration(avenue, { _addon: { sourceOverrideVersion: 1 } }), false);
assert.equal(getVerifiedSourceOverride({ csfdUrl: 'https://www.csfd.cz/film/9999999-other/' }), null);

console.log('Verified source override tests passed.');
