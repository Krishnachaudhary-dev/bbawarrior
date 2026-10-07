import {
  broadcastChange,
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
 * POST /api/auth/register   { username, password, code }
 *
 * A classmate joins with the class code. The password is hashed here, before it
 * ever touches storage, and the response starts an authenticated session so the
 * browser never needs to write the password anywhere. Rate limited per address
 * so the class code cannot be guessed at speed.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = cleanUsername(body.username);
  const password = cleanNewPassword(body.password);
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (!username) {
    return send(res, 400, { ok: false, reason: 'Usernames need 2 to 24 characters.' });
  }
  if (!password) {
    return send(res, 400, { ok: false, reason: 'Use at least 8 characters for a password.' });
  }
  if (!code || code.length > 64) {
    return send(res, 400, { ok: false, reason: 'Enter the class code.' });
  }

  const gate = rateLimit('register:' + clientIp(req), MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  try {
    const state = (await readState()) || {};
    const storedCode = String((state.config && state.config.classCode) || '');
    if (!storedCode || code.toLowerCase() !== storedCode.trim().toLowerCase()) {
      return send(res, 403, { ok: false, reason: 'That class code is not right.' });
    }

    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const taken = accounts.some(
      (a) => a && String(a.username || '').replace(/\s+/g, ' ').trim().toLowerCase() === username.toLowerCase(),
    );
    if (taken) {
      return send(res, 400, { ok: false, reason: 'That username is already taken.' });
    }

    const fresh = {
      id: 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      username,
      password: hashPassword(password),
      role: 'student',
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };

    await writeState({ ...state, accounts: [...accounts, fresh] });
    await broadcastChange('enrol');

    const { token } = await createSession(fresh.id, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    res.setHeader('Set-Cookie', sessionCookie(token, sessionMaxAgeSeconds()));
    return send(res, 200, { ok: true, account: publicAccount(fresh) });
  } catch (err) {
    console.error('[api/auth/register] failed', err && err.message);
    return send(res, 500, { ok: false, reason: 'That account could not be created.' });
  }
}
