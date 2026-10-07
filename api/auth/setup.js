import {
  createSession,
  hashPassword,
  isConfigured,
  publicAccount,
  readState,
  sessionMaxAgeSeconds,
  writeState,
} from '../_db.js';
import {
  cleanNewPassword,
  cleanUsername,
  clientIp,
  guardWrite,
  rateLimit,
  rateLimited,
  send,
  sessionCookie,
} from '../_security.js';

/**
 * POST /api/auth/setup   { username, password }
 *
 * The first run: allowed only while the board holds no accounts at all, which
 * is what makes it safe without a shared secret. The moment one account exists
 * this endpoint answers 403 forever. The password is hashed here, minimum eight
 * characters, so there is no universal default admin anywhere in the system,
 * and the creator is signed in immediately through the same session machinery
 * as every later sign in.
 */

const WINDOW_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = cleanUsername(body.username);
  const password = cleanNewPassword(body.password);

  if (!username) return send(res, 400, { ok: false, reason: 'Usernames need 2 to 24 characters.' });
  if (!password) return send(res, 400, { ok: false, reason: 'Use at least 8 characters for a password.' });

  const gate = rateLimit('setup:' + clientIp(req), MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  try {
    const state = (await readState()) || {};
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    if (accounts.length > 0) {
      return send(res, 403, { ok: false, reason: 'This board already has an account. Sign in instead.' });
    }

    const fresh = {
      id: 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      username,
      password: hashPassword(password),
      role: 'admin',
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };

    await writeState({ ...state, accounts: [fresh] });

    const { token } = await createSession(fresh.id, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    res.setHeader('Set-Cookie', sessionCookie(token, sessionMaxAgeSeconds()));
    return send(res, 200, { ok: true, account: publicAccount(fresh) });
  } catch (err) {
    console.error('[api/auth/setup] failed', err && err.message);
    return send(res, 500, { ok: false, reason: 'Could not create the first account.' });
  }
}
