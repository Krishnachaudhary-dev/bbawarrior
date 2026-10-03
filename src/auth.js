/**
 * Shared single sign-on between this quiz site and the BBA Section H assignment
 * organizer. The organizer is served from public/assignments.html, so both pages
 * run on the same origin and can read the same two localStorage keys:
 *
 *   bba-section-h-organizer.config.v1   subjects, class code, accounts
 *   bba-section-h-organizer.session.v1  who is signed in, never a password
 *
 * Signing in here writes the session key, so opening the organizer already shows
 * that person signed in, and the reverse works the same way.
 */

export const CONFIG_KEY = 'bba-section-h-organizer.config.v1';
export const SESSION_KEY = 'bba-section-h-organizer.session.v1';
export const ORGANIZER_PATH = 'assignments.html';
export const ADMIN_HASH = '#admin';

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

function tidy(account) {
  return {
    id: String(account.id),
    username: String(account.username),
    role: account.role === 'admin' ? 'admin' : 'student',
  };
}

export function readConfig() {
  const config = readJSON(CONFIG_KEY);
  return config && typeof config === 'object' ? config : null;
}

export function readAccounts() {
  const config = readConfig();
  if (!config || !Array.isArray(config.accounts)) return [];
  return config.accounts.filter((a) => a && a.username);
}

export function readAdmins() {
  return readAccounts().filter((a) => a.role === 'admin');
}

/** The signed in person, or null when nobody is signed in or the account is gone. */
export function readSession() {
  const config = readConfig();
  if (!config || !Array.isArray(config.accounts)) return null;
  const session = readJSON(SESSION_KEY);
  if (!session || !session.id) return null;
  const found = config.accounts.find((a) => String(a.id) === String(session.id));
  return found ? tidy(found) : null;
}

/** Checks a class login and, on success, signs the person in on both sites. */
export function signIn(username, password) {
  const name = String(username || '').replace(/\s+/g, ' ').trim();
  if (!name || !password) return { ok: false, reason: 'Enter your username and password.' };

  const config = readConfig();
  const accounts = Array.isArray(config && config.accounts) ? config.accounts : [];
  if (!accounts.length) {
    return {
      ok: false,
      reason: 'No class logins saved on this device yet. Open Assignments once, then sign in here.',
      empty: true,
    };
  }

  const found = accounts.find((a) => String(a.username).toLowerCase() === name.toLowerCase());
  if (!found || found.password !== password) {
    return { ok: false, reason: 'That username and password do not match.' };
  }
  if (found.role === 'admin') {
    return { ok: false, reason: 'Admin accounts sign in from the admin gate.', action: 'admin-gate' };
  }

  /* Stamp the sign in time the same way the organizer does, then publish the session. */
  const next = { ...config, accounts: accounts.map((a) => (a.id === found.id ? { ...a, lastSeen: Date.now() } : a)) };
  if (!writeJSON(CONFIG_KEY, next) || !writeJSON(SESSION_KEY, { id: found.id, at: Date.now() })) {
    return { ok: false, reason: 'Could not save. Browser storage is unavailable.' };
  }
  return { ok: true, account: tidy(found) };
}

/** Checks an admin login for the quiz admin panel. */
export function signInAdmin(username, password) {
  const name = String(username || '').replace(/\s+/g, ' ').trim();
  if (!name || !password) return { ok: false, reason: 'Enter your admin username and password.' };

  const config = readConfig();
  const admins = Array.isArray(config && config.accounts)
    ? config.accounts.filter((a) => a && a.username && a.role === 'admin')
    : [];
  if (!admins.length) {
    return {
      ok: false,
      reason: 'No admin login on this device yet. Open Assignments once, then come back.',
      empty: true,
    };
  }

  const found = admins.find((a) => String(a.username).toLowerCase() === name.toLowerCase());
  if (!found || found.password !== password) {
    return { ok: false, reason: 'That admin username and password are not correct.' };
  }
  return { ok: true, account: tidy(found) };
}

export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (err) {
    /* nothing to clear */
  }
}

/** Calls back when another tab on this origin signs in or out. */
export function watchSession(handler) {
  const onStorage = (event) => {
    if (event.key && event.key !== SESSION_KEY && event.key !== CONFIG_KEY) return;
    handler();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function organizerUrl(hash) {
  const base = (import.meta.env.BASE_URL || '/') + ORGANIZER_PATH;
  return hash ? base + hash : base;
}