/**
 * Sign-in helpers for the quiz site.
 *
 * Sign in runs against the class board's session API: username and password go
 * to POST /api/auth/login on this origin, the server checks the stored hash and
 * answers with an HttpOnly session cookie plus the public account fields. This
 * file never sees a stored password, never compares one locally, and never
 * writes a session to localStorage: identity lives on the server, and a browser
 * that downloads this code learns nothing that helps it become someone else.
 */

export const ORGANIZER_PATH = 'assignments.html';

/**
 * A UI hint only: it opens the organizer's admin sign in screen. Every
 * privileged call anywhere in this project is authorised server side against
 * the session, never against this string.
 */
export const ADMIN_HASH = '#admin';

async function post(path, payload) {
  let res;
  try {
    res = await fetch((import.meta.env.BASE_URL || '/') + 'api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, offline: true, reason: 'The class board could not be reached.' };
  }
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    return { ok: false, offline: true, reason: 'The class board did not answer.' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, offline: true, reason: 'The class board did not answer.' };
  }
  if (!data.ok) {
    return {
      ok: false,
      setup: Boolean(data.setup),
      reason: data.reason || 'The class board refused that sign in.',
    };
  }
  return { ok: true, account: data.account };
}

/**
 * Signs in an admin for the quiz panel. The server enforces adminOnly against
 * the role stored on the board, so this is a convenience check, not the gate.
 */
export function signInAdmin(username, password) {
  const name = String(username || '').replace(/\s+/g, ' ').trim();
  if (!name || !password) {
    return Promise.resolve({ ok: false, reason: 'Enter your admin username and password.' });
  }
  return post('/auth/login', { username: name, password, adminOnly: true });
}

export function organizerUrl(hash) {
  const base = (import.meta.env.BASE_URL || '/') + ORGANIZER_PATH;
  return hash ? base + hash : base;
}
