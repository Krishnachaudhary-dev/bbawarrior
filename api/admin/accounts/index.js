import {
  broadcastChange,
  hashPassword,
  isConfigured,
  publicAccounts,
  readState,
  requireAdmin,
  writeState,
} from '../../_db.js';
import {
  ROLES,
  cleanNewPassword,
  cleanUsername,
  clientIp,
  guardWrite,
  rateLimit,
  rateLimited,
  send,
} from '../../_security.js';

/**
 * POST /api/admin/accounts   { username, password, role }
 *
 * Creating a login, admin only, session authenticated. The password is hashed
 * here; nothing in this request path ever stores or returns a plaintext secret,
 * and the response is the full public account list (id, username, role, times)
 * so the client can refresh its copy in one round trip.
 */

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 60;
const ALLOWED = new Set(['username', 'password', 'role']);

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const auth = await requireAdminSession(req, res);
  if (!auth) return;

  const gate = rateLimit('admin:' + clientIp(req), MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED.has(key)) {
      return send(res, 400, { ok: false, reason: `Unknown field "${key}".` });
    }
  }

  const username = cleanUsername(body.username);
  const password = cleanNewPassword(body.password);
  const role = body.role;

  if (!username) return send(res, 400, { ok: false, reason: 'Usernames need 2 to 24 characters.' });
  if (!password) return send(res, 400, { ok: false, reason: 'Use at least 8 characters for a password.' });
  if (!ROLES.has(role)) return send(res, 400, { ok: false, reason: 'Role must be admin or student.' });

  try {
    const state = (await readState()) || {};
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const taken = accounts.some(
      (a) => a && String(a.username || '').replace(/\s+/g, ' ').trim().toLowerCase() === username.toLowerCase(),
    );
    if (taken) return send(res, 400, { ok: false, reason: 'Someone with that name is already on the list.' });

    const fresh = {
      id: 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      username,
      password: hashPassword(password),
      role,
      createdAt: Date.now(),
      lastSeen: 0,
    };

    const next = { ...state, accounts: [...accounts, fresh] };
    await writeState(next);
    await broadcastChange('accounts');
    return send(res, 200, { ok: true, accounts: publicAccounts(next.accounts) });
  } catch (err) {
    console.error('[api/admin/accounts] create failed', err && err.message);
    return send(res, 500, { ok: false, reason: 'Could not create that login.' });
  }
}

async function requireAdminSession(req, res) {
  const result = await requireAdmin(req);
  if (!result.ok) {
    send(res, result.status || 403, { ok: false, reason: result.reason });
    return null;
  }
  return result;
}
