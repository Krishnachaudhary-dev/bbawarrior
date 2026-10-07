import {
  createSession,
  hashPassword,
  isConfigured,
  publicAccount,
  readState,
  sessionMaxAgeSeconds,
  verifyPassword,
  writeState,
} from '../_db.js';
import {
  cleanUsername,
  clientIp,
  guardWrite,
  rateLimit,
  rateLimited,
  rateReset,
  send,
  sessionCookie,
} from '../_security.js';

/**
 * POST /api/auth/login   { username, password, adminOnly? }
 *
 * The only place a password is ever accepted. It is compared against the stored
 * hash and then forgotten: the answer is a random session token in an HttpOnly
 * cookie. The response body carries the public account fields and nothing else.
 *
 * Failures are deliberately uniform (same status, same reason) whether the
 * username is unknown or the password is wrong, so the endpoint cannot be used
 * to enumerate the class roster. The adminOnly flag only decides which screen
 * sent the request; real admin rights are re-read from the board on every
 * protected call, never taken from this flag.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/* A fixed hash to verify against when the username is unknown, so a missed
   lookup costs the same scrypt work as a hit and the response time does not
   reveal whether the name exists. */
let timingPad = null;
function padHash() {
  if (!timingPad) timingPad = hashPassword('timing-pad-' + Math.random());
  return timingPad;
}

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = cleanUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password || password.length > 200) {
    return send(res, 400, { ok: false, reason: 'Enter your username and password.' });
  }

  const ip = clientIp(req);
  const key = 'login:' + ip + ':' + username.toLowerCase();
  const gate = rateLimit(key, MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  const adminOnly = Boolean(body.adminOnly);

  try {
    const state = (await readState()) || {};
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    if (!accounts.length) {
      return send(res, 401, { ok: false, setup: true, reason: 'This board has no account yet.' });
    }

    const wanted = username.toLowerCase();
    const found = accounts.find(
      (a) => a && String(a.username || '').replace(/\s+/g, ' ').trim().toLowerCase() === wanted,
    );
    const stored = found && typeof found.password === 'string' && found.password ? found.password : padHash();
    const passwordOk = verifyPassword(stored, password);

    if (!found || !passwordOk) {
      return send(res, 401, { ok: false, reason: 'That username or password is not right.' });
    }
    if (adminOnly && found.role !== 'admin') {
      return send(res, 403, { ok: false, reason: 'That is a student login. Use the class sign in instead.' });
    }

    rateReset(key);

    const { token } = await createSession(found.id, {
      ip,
      userAgent: req.headers['user-agent'] || '',
    });

    /* Heartbeat only: a failed write must never fail a sign in. */
    try {
      const now = Date.now();
      await writeState({
        ...state,
        accounts: accounts.map((a) => (String(a.id) === String(found.id) ? { ...a, lastSeen: now } : a)),
      });
    } catch (err) {
      console.error('[api/auth/login] lastSeen update failed', err && err.message);
    }

    res.setHeader('Set-Cookie', sessionCookie(token, sessionMaxAgeSeconds()));
    return send(res, 200, { ok: true, account: publicAccount({ ...found, lastSeen: Date.now() }) });
  } catch (err) {
    console.error('[api/auth/login] failed', err && err.message);
    return send(res, 500, { ok: false, reason: 'Could not sign you in right now.' });
  }
}
