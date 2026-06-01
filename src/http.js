import axios from 'axios';

export async function getWithRetry(url, options = {}, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await axios.get(url, options);
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}
