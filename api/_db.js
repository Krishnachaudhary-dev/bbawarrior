import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * The one place that talks to Supabase. Only these serverless functions ever hold
 * the service role key, so the browser never ships a database credential.
 *
 * Set on Vercel (Project Settings, Environment Variables). Supabase renamed these
 * keys, so both spellings are read and the new one wins:
 *
 *   SUPABASE_URL                 https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY          sb_secret_...   (new name, what the dashboard
 *   SUPABASE_SERVICE_ROLE_KEY                   shows today; legacy name still read)
 *   SUPABASE_PUBLISHABLE_KEY     sb_publishable_...  handed to the browser for the
 *   SUPABASE_ANON_KEY                            realtime doorbell only. Public by
 *                                               design, and row level security
 *                                               still refuses it.
 *
 * The values are trimmed and unwrapped before use, because a key pasted as
 * "SUPABASE_SECRET_KEY=sb_secret_..." or with quotes still around it is refused
 * by Supabase with "Invalid API key", and that reads like a wrong key when it is
 * only a messy paste.
 */

const TABLE = 'class_state';
const ROW_ID = 'section-h';

/** The server key, under either name, cleaned up. */
export function secretKey() {
  return readKeyEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
}

/** The browser key, under either name, cleaned up. Null when it is not set. */
export function publishableKey() {
  return readKeyEnv(['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']);
}

function readKeyEnv(names) {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw !== 'string') continue;
    const cleaned = cleanKeyValue(raw, name);
    if (cleaned) return cleaned;
  }
  return null;
}

/**
 * Turns a pasted value into the key itself. Trims whitespace, drops one layer of
 * quotes, and removes a leading "NAME=" when a whole env line was pasted instead
 * of just the value. Returns null when nothing usable is left, and never returns
 * anything with whitespace inside it, since Supabase rejects those as invalid.
 */
export function cleanKeyValue(raw, name) {
  let value = String(raw == null ? '' : raw).trim();
  if (!value) return null;

  if (name && value.length > name.length) {
    const head = value.slice(0, name.length);
    if (head.toLowerCase() === name.toLowerCase()) {
      const rest = value.slice(name.length);
      if (rest.startsWith('=')) value = rest.slice(1).trim();
    }
  }

  const quoted = value.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) value = quoted[2].trim();

  return value || null;
}

export function isConfigured() {
  return Boolean(String(process.env.SUPABASE_URL || '').trim() && secretKey());
}

function client() {
  return createClient(String(process.env.SUPABASE_URL || '').trim(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const EMPTY = {
  config: { classCode: 'SECTION-H', subjects: [] },
  items: [],
  accounts: [],
  attendance: [],
};

/**
 * Turns a Supabase failure into something readable in the Vercel logs. The browser
 * still gets a plain sentence, but the log keeps the code, message and hint that
 * actually explain what went wrong.
 */
export function describeError(err) {
  if (!err) return { message: 'Unknown error.' };
  /* An empty message is common: a HEAD request that fails hands back
     { message: '' }, and falling through to String(err) would print
     "[object Object]" and hide the only detail that existed. Fall back to the
     object's own keys so the shape at least survives. */
  const message = String(err.message || '').trim();
  const fallback = (() => {
    try {
      const keys = Object.keys(err).filter((k) => k !== 'message');
      return keys.length ? `{ ${keys.join(', ')} }` : 'no details were returned';
    } catch (e) {
      return 'no details were returned';
    }
  })();
  return {
    name: err.name || null,
    code: err.code || null,
    status: err.status || null,
    message: message || fallback,
    details: err.details || null,
    hint: err.hint || null,
  };
}

/**
 * Names the kind of key without revealing it, so "Invalid API key" turns into
 * something actionable. New keys are not JWTs, so their prefix is the whole
 * story; a legacy key has its role claim decoded, never verified. The key itself
 * is never printed, and at most four characters of the random part are shown,
 * which is what makes a single mistyped character visible next to the dashboard.
 */
export function keyRoleHint(key) {
  if (!key) return null;
  const value = String(key).trim();

  if (value.startsWith('sb_secret_')) return 'secret key (sb_secret_), this is the right one for the server';
  if (value.startsWith('sb_publishable_')) return 'publishable key (sb_publishable_), browser only, cannot write';
  if (value.startsWith('sb_')) return 'sb_ key of an unknown subtype, Supabase may not recognise it';
  if (!value.startsWith('eyJ')) {
    return 'not a Supabase key at all: no sb_ prefix and not a JWT, so something else was pasted here';
  }
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64').toString('utf8'));
    return payload.role === 'service_role'
      ? 'legacy service_role key, correct for the server'
      : `legacy key with role "${payload.role || 'unstated'}", service_role is the one that can write`;
  } catch (err) {
    return 'legacy key that could not be decoded, treat it as suspect';
  }
}

/**
 * A short, non-reversible fingerprint: the key prefix plus length plus the first
 * four characters of the random part. Enough to tell "this is the same key the
 * dashboard shows" from "one character differs", useless to anyone who does not
 * already have the key. Never returns the key.
 */
export function keyFingerprint(key) {
  if (!key) return null;
  const value = String(key).trim();
  /* New keys have two underscores, sb_secret_ or sb_publishable_, and the type is
     only meaningful up to the second one. A legacy JWT has none. */
  const parts = value.split('_');
  const prefix = parts.length >= 3 ? parts.slice(0, 2).join('_') + '_' : '';
  return {
    prefix: prefix || '(legacy JWT)',
    length: value.length,
    head: value.slice(prefix.length, prefix.length + 4),
    hasWhitespaceInside: /\s/.test(value),
  };
}

/**
 * Everything GET /api/health reports. One request tells you whether the problem
 * is a missing variable, the wrong key, the wrong URL, or the table itself.
 */
export async function diagnose() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = secretKey() || '';
  const report = {
    configured: { url: Boolean(url), serviceKey: Boolean(key), publishableKey: Boolean(publishableKey()) },
    /* Which variable each value came from, so a rename cannot hide a setting. */
    readFrom: {
      url: 'SUPABASE_URL',
      secretKey: key ? (process.env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY') : null,
      publishableKey: publishableKey()
        ? (process.env.SUPABASE_PUBLISHABLE_KEY ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_ANON_KEY')
        : null,
    },
    urlLooksLikeProjectUrl: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url),
    keyRole: keyRoleHint(key),
    keyFingerprint: keyFingerprint(key),
    table: TABLE,
    rowId: ROW_ID,
    reachable: false,
    rows: null,
    error: null,
  };

  if (!report.configured.url || !report.configured.serviceKey) {
    report.error = {
      message: 'SUPABASE_URL or the secret key (SUPABASE_SECRET_KEY) is missing in this deployment.',
    };
    return report;
  }

  try {
    /* Deliberately not head: true. A failed HEAD hands back an error whose message
       is an empty string, so an unreachable project reported only
       "[object Object]". One row of one column costs nothing and keeps the real
       message. */
    const { count, error } = await client()
      .from(TABLE)
      .select('id', { count: 'exact' })
      .eq('id', ROW_ID);
    report.reachable = !error;
    report.rows = count;
    report.error = error ? describeError(error) : null;
  } catch (err) {
    report.error = describeError(err);
  }

  /* "Invalid API key" names neither the variable nor the kind of key, and it is
     the single most common failure here, so it gets an explanation attached. The
     other two causes are separated because they need different fixes. */
  if (/invalid api key|no api key found/i.test(String(report.error?.message || ''))) {
    const where = report.readFrom.secretKey;
    report.remedy = report.configured.url
      ? `Supabase refused the key read from ${where}. Copy the sb_secret_... value again in Project Settings > Environment Variables, as the value only, with no name and no quotes, then redeploy.`
      : 'Set SUPABASE_URL to your Project URL and the sb_secret_... key to SUPABASE_SECRET_KEY, then redeploy.';
  } else if (report.error && !report.urlLooksLikeProjectUrl) {
    report.remedy = 'SUPABASE_URL does not look like a Project URL. Use https://<project-ref>.supabase.co, not the JWKS url or a connection string.';
  }

  return report;
}

/**
 * The public half of the Supabase config, so the browser can listen for the
 * doorbell. Returns null when the anon key is not set, and the app then simply
 * keeps using its poll.
 */
export function realtimeConfig() {
  if (!isConfigured()) return null;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = publishableKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** The whole class document. One row keeps the sync model honest: one shared copy.
    No row yet is normal, it returns the empty shape rather than failing. */
export async function readState() {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
  if (error) throw error;
  return data ? { ...EMPTY, ...data.data } : { ...EMPTY };
}

/** What the browser is allowed to see. The shared document keeps passwords so an
    admin can sign in again on a new device, but publishing them would hand every
    login in the class to anyone who opened /api/state, so they stop here. */
export function publicState(state) {
  const src = state && typeof state === 'object' ? state : {};
  const accounts = Array.isArray(src.accounts) ? src.accounts : [];
  return {
    ...src,
    accounts: accounts.map((account) => {
      if (!account || typeof account !== 'object') return account;
      const clean = { ...account };
      delete clean.password;
      return clean;
    }),
  };
}

/* ---- password storage ---------------------------------------------------
   A password is hashed here and nowhere else, so a row that reaches Supabase
   never holds one that can be read back. scrypt comes from node:crypto, which
   means there is no dependency to install and nothing to keep up to date. */

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PREFIX = 'scrypt$';

/** Hashes a password for storage. The salt is per password, so two identical
    passwords do not produce identical rows. */
export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 64, SCRYPT);
  return PREFIX + salt.toString('base64') + '$' + hash.toString('base64');
}

export function isHashed(stored) {
  return typeof stored === 'string' && stored.indexOf(PREFIX) === 0;
}

/** Checks a typed password against what is stored. Accepts a hash, and also a
    plain value, because a board that predates this change still holds those and
    has to keep working until it is migrated. */
export function verifyPassword(stored, typed) {
  if (typeof stored !== 'string' || !stored) return false;
  if (!isHashed(stored)) return sameSecret(stored, typed);
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const actual = scryptSync(String(typed), salt, expected.length, SCRYPT);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch (err) {
    return false;
  }
}

/** Replaces any plain password with a hash, leaving hashed ones and accounts with
    no password alone. Runs on every write, so nothing readable can reach the row
    even if a caller forgets. */
export function withHashedSecrets(state) {
  const src = state && typeof state === 'object' ? state : {};
  const accounts = Array.isArray(src.accounts) ? src.accounts : [];
  return {
    ...src,
    accounts: accounts.map((account) => {
      if (!account || typeof account !== 'object') return account;
      if (typeof account.password !== 'string' || !account.password) return account;
      if (isHashed(account.password)) return account;
      return { ...account, password: hashPassword(account.password) };
    }),
  };
}

/**
 * Merges the account list a browser sent with the one already stored, keeping every
 * secret the board holds.
 *
 * Since the board stopped publishing passwords, an account arriving from any other
 * device, or enrolled by a classmate, carries no password at all, and one this
 * device never held a copy of arrives blank. A blank therefore means "nothing to say
 * about this one", not "remove the secret", so the stored value is carried across.
 * Without this, an admin adding, renaming or repromoting any login would post a list
 * full of blanks and erase every password on the board, and with hashing in place
 * there would be no way back to the originals. Removing a login is still a delete:
 * an account missing from the incoming list is gone, as it always was.
 */
export function keepStoredSecrets(incoming, stored) {
  const list = Array.isArray(incoming) ? incoming : [];
  const existing = Array.isArray(stored) ? stored : [];
  return list.map((account) => {
    if (!account || typeof account !== 'object') return account;
    if (typeof account.password === 'string' && account.password) return account;
    const known = existing.find((a) => a && String(a.id) === String(account.id));
    if (!known || typeof known.password !== 'string' || !known.password) return account;
    return { ...account, password: known.password };
  });
}

/** How many accounts still hold a plain password, so the migration can report it. */
export function countPlainPasswords(state) {
  const accounts = (state && state.accounts) || [];
  return accounts.filter((a) => a && typeof a.password === 'string' && a.password && !isHashed(a.password)).length;
}

/** Replaces the document. An admin deleting an assignment lands here for everyone. */
export async function writeState(next) {
  if (!isConfigured()) return false;
  const { error } = await client()
    .from(TABLE)
    .upsert({ id: ROW_ID, data: withHashedSecrets(next), updated_at: new Date().toISOString() });
  if (error) throw error;
  return true;
}

export async function appendAttendance(entry) {
  const state = (await readState()) || { ...EMPTY };
  const attendance = [entry, ...(state.attendance || [])].slice(0, 200);
  const next = { ...state, attendance };
  await writeState(next);
  return next;
}

/** Compares without giving away how many leading characters were right. */
function sameSecret(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  const longest = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < longest; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Who is allowed to write. Hiding a button is a courtesy, this is the protection:
 * saveBoard, saveConfig and saveAccounts belong to an admin alone, and attendance
 * only needs a login that is really on the board.
 */
export async function authorise(claims, needAdmin = true) {
  if (!claims || !claims.id) return { ok: false, reason: 'Sign in before saving.' };

  const state = (await readState()) || {};
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const found = accounts.find((a) => String(a.id) === String(claims.id));
  if (!found) return { ok: false, reason: 'That login is not on this board any more.' };
  if (!verifyPassword(found.password, claims.password)) return { ok: false, reason: 'That password is not right.' };
  if (needAdmin && found.role !== 'admin') return { ok: false, reason: 'Only the admin can change the board.' };

  return { ok: true, account: found };
}

/**
 * Rings the doorbell after a successful save. It carries no board data, only the
 * fact that something changed, so nothing sensitive crosses this channel: the
 * browser then re-reads /api/state, where the rules live. Never throws, and it is
 * capped so a slow socket costs the instant update rather than the save.
 */
export async function broadcastChange(what) {
  if (!isConfigured()) return false;
  let supabase = null;
  let channel = null;
  try {
    supabase = client();
    channel = supabase.channel('class-board');
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await channel.send({
      type: 'broadcast',
      event: 'changed',
      payload: { what: String(what || ''), at: Date.now() },
    });
    return true;
  } catch (err) {
    return false;
  } finally {
    if (channel && supabase) {
      try {
        await supabase.removeChannel(channel);
      } catch (err) {
        /* the socket is going away anyway */
      }
    }
  }
}