import assert from 'node:assert/strict';
import { authorizeRefresh } from '../src/refresh-auth.js';
const saved = process.env.REFRESH_TOKEN;
function request(auth) {
  let status, allowed = false;
  authorizeRefresh({headers:{authorization:auth}}, {status(s){status=s;return this;},json(){return this;}},()=>{allowed=true;});
  return {status,allowed};
}
try {
  delete process.env.REFRESH_TOKEN;
  assert.equal(request('Bearer secret').status,503);
  process.env.REFRESH_TOKEN='test-token';
  for(const auth of ['', 'Bearer wrong', 'test-token']) assert.equal(request(auth).status,401);
  assert.equal(request('Bearer test-token').allowed,true);
} finally {
  if(saved===undefined)delete process.env.REFRESH_TOKEN;else process.env.REFRESH_TOKEN=saved;
}
console.log('Manual refresh authentication passed');
