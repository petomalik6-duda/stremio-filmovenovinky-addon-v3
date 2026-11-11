import { timingSafeEqual } from 'node:crypto';
export function authorizeRefresh(req, res, next) {
  const expected = String(process.env.REFRESH_TOKEN || '');
  if (!expected) return res.status(503).json({ ok: false, error: 'Manual refresh is disabled' });
  const header = String(req.headers.authorization || '');
  const provided = /^Bearer /i.test(header) ? header.slice(7) : '';

  const a = Buffer.from(expected), b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}
