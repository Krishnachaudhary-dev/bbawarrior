import {
  authenticate,
  destroyOtherSessions,
  hashPassword,
  isConfigured,
  readState,
  verifyPassword,
  writeState,
} from '../_db.js';
import {
  cleanNewPassword,
  clientIp,
  guardWrite,
  rateLimit,
  rateLimited,
  rateReset,
  send,
} from '../_security.js';

/**
 * POST /api/auth/change-password   { currentPassword, newPassword }
 *
 * Entirely server side: the session decides who is asking, the stored hash
 * decides whether the current password is right, the new password is hashed and
 * replaces the old one, and every other session for the account is invalidated
 * so a copy of the old password held on another device stops working at once.
 * The device that made the change stays signed in.
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = cleanNewPassword(body.newPassword);

  if (!current) return send(res, 400, { ok: false, reason: 'Enter your current password.' });
  if (!next) return send(res, 400, { ok: false, reason: 'Use at least 8 characters for a new password.' });

  const gate = rateLimit('chpw:' + clientIp(req), MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  const auth = await authenticate(req);
  if (!auth.ok) return send(res, auth.status || 401, { ok: false, reason: auth.reason });

  if (next === current) {
    return send(res, 400, { ok: false, reason: 'Pick something different from the current password.' });
  }

  try {
    const state = (await readState()) || {};
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const found = accounts.find((a) => String(a && a.id) === String(auth.account.id));
    if (!found) return send(res, 401, { ok: false, reason: 'That login no longer exists.' });

    if (!verifyPassword(found.password, current)) {
      return send(res, 403, { ok: false, reason: 'That is not your current password.' });
    }

    await writeState({
      ...state,
      accounts: accounts.map((a) =>
        String(a.id) === String(found.id) ? { ...a, password: hashPassword(next) } : a,
      ),
    });

    rateReset('chpw:' + clientIp(req));
    await destroyOtherSessions(found.id, auth.token);
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('[api/auth/change-password] failed', err && err.message);
    return send(res, 500, { ok: false, reason: 'Could not save that password.' });
  }
}
