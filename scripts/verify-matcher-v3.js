import { titleMatchScore } from '../src/matching.js';

const cases = [
  ['The Accountant 2', 'The Accountant²', '', [], 94],
  ['Grand Maison Paris', 'Grande Maison Paris', '', [], 88],
  ['Lesný vrah', 'Lesní vrah', '', [], 88],
  ['Avenue of the Giants', 'The Optimist', 'The Optimist', ['Avenue of the Giants'], 100],
];

for (const [q, n, o, aliases, min] of cases) {
  const score = titleMatchScore(q, n, o, aliases);
  if (score < min) throw new Error(`${q} -> ${n} score ${score}, expected >= ${min}`);
}
console.log('matcher v3 OK');
