import { authenticate, publicAccount } from '../_db.js';
import { methodGuard, send } from '../_security.js';

/**
 * GET /api/auth/me
 *
 * Who the session cookie says you are, resolved entirely server side: the token
 * is looked up by hash, both session clocks are enforced, and the account and
 * role are reloaded from the board. 401 when there is no usable session, which
 * is the signal the client uses to show the sign in screen.
 */

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;

  const auth = await authenticate(req);
  if (!auth.ok) return send(res, auth.status || 401, { ok: false, reason: auth.reason });
  return send(res, 200, { ok: true, account: publicAccount(auth.account) });
}
