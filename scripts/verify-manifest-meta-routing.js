import fs from 'fs';

const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const expected = "{ name: 'meta', types: ['movie'], idPrefixes: ['tt', 'filmovenovinky:'] }";

if (!src.includes(expected)) {
  console.error('FAIL: manifest must explicitly advertise movie meta for tt and filmovenovinky: IDs');
  process.exit(1);
}

if (!src.includes("version: '3.6.8'")) {
  console.error('FAIL: server manifest version is not 3.6.8');
  process.exit(1);
}

console.log('OK: manifest explicitly routes movie metadata for IMDb and local IDs.');
