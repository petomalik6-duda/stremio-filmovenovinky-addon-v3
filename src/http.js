import axios from 'axios';

const DEFAULT_TIMEOUT = Number(process.env.REQUEST_TIMEOUT_MS || 60000);
const DEFAULT_RETRIES = Number(process.env.HTTP_RETRIES || 2);

function withCacheBust(url) {
  if (String(process.env.DISABLE_SOURCE_CACHE_BUST || 'false').toLowerCase() === 'true') return url;
  try {
    const u = new URL(url);
    if (/filmovenovinky\.sk$/i.test(u.hostname)) {
      u.searchParams.set('_cb', String(Date.now()));
      return u.toString();
    }
  } catch {}
  return url;
}

export async function getWithRetry(url, options = {}, attempts = DEFAULT_RETRIES) {
  let last;
  const requestOptions = {
    timeout: DEFAULT_TIMEOUT,
    ...options,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StremioFilmovenovinkyAddon/3.7; +https://www.stremio.com/)',
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      ...(options.headers || {})
    }
  };

  const requestUrl = withCacheBust(url);

  for (let i = 0; i < attempts; i++) {
    try {
      return await axios.get(requestUrl, requestOptions);
    } catch (e) {
      last = e;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw last;
}
