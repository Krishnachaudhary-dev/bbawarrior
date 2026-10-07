import {
  broadcastChange,
  destroySessionsFor,
  hashPassword,
  isConfigured,
  readState,
  requireAdmin,
  writeState,
} from '../../../_db.js';
import {
  cleanNewPassword,
  clientIp,
  guardWrite,
  rateLimit,
  rateLimited,
  send,
} from '../../../_security.js';

/**
 * POST /api/admin/accounts/:id/reset-password   { newPassword }
 *
 * The only way one login can set another's password. Admin only, session
 * authenticated, strict body. The new password is hashed here, and because a
 * reset exists precisely because the old credential should stop working, every
 * session belonging to that account is invalidated immediately.
 */

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 30;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ALLOWED = new Set(['newPassword']);

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, auth.status || 403, { ok: false, reason: auth.reason });

  const gate = rateLimit('admin:' + clientIp(req), MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  const id = String((req.query && req.query.id) || '');
  if (!ID_PATTERN.test(id)) {
    return send(res, 400, { ok: false, reason: 'That account id is not valid.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED.has(key)) {
      return send(res, 400, { ok: false, reason: `Unknown field "${key}".` });
    }
  }
  const next = cleanNewPassword(body.newPassword);
  if (!next) return send(res, 400, { ok: false, reason: 'Use at least 8 characters for a password.' });

  try {
    const state = (await readState()) || {};
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const index = accounts.findIndex((a) => String(a && a.id) === id);
    if (index < 0) return send(res, 404, { ok: false, reason: 'That login is not on this board.' });

    const updated = accounts.map((a, i) => (i === index ? { ...a, password: hashPassword(next) } : a));
    await writeState({ ...state, accounts: updated });
    await destroySessionsFor(id);
    await broadcastChange('accounts');
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('[api/admin/accounts] reset failed', err && err.message);
    return send(res, 500, { ok: false, reason: 'Could not reset that password.' });
  }
}
