import { destroySession } from '../_db.js';
import { clearSessionCookie, guardWrite, send, sessionTokenFrom } from '../_security.js';

/**
 * POST /api/auth/logout
 *
 * Invalidates the server side session behind the cookie, then clears the
 * cookie. Idempotent: logging out twice, or with no session at all, still
 * answers ok so the client can always reach a signed out state.
 */

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  const token = sessionTokenFrom(req);
  await destroySession(token);
  res.setHeader('Set-Cookie', clearSessionCookie());
  return send(res, 200, { ok: true });
}
