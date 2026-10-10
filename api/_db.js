import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import ws from 'ws';
import { hashToken, sessionTokenFrom } from './_security.js';

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
    /* supabase-js 2.109 constructs its realtime client eagerly and needs a
       WebSocket implementation to do it: on a Node 20 runtime (Vercel's
       default) it throws at createClient() and every read of the board fails.
       ws is the transport the library itself suggests; only the server push
       doorbell ever opens a socket, ordinary reads and writes stay on fetch. */
    realtime: { transport: ws },
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
 * A short, non-reversible fingerprint: the key prefix and its length. Enough to
 * tell "this is the same key the dashboard shows" from "a different key was
 * pasted here", useless to anyone who does not already have the key. Never
 * returns any characters of the key itself: an earlier version showed the first
 * four characters of the random part, which is more of a secret than a
 * diagnostic needs.
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
}/** The bucket that holds assignment PDFs and pictures. Files live here; a row
   only ever holds a short public URL, never the bytes. */
const BUCKET = 'assignments';

/** Mirrors the bucket's file_size_limit (see supabase/schema.sql). */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tiff',
};

function extForMime(mime) {
  const type = String(mime || '').toLowerCase().split(';')[0].trim();
  if (MIME_EXTENSIONS[type]) return MIME_EXTENSIONS[type];
  const subtype = type.includes('/') ? type.split('/')[1] : '';
  const safe = subtype.replace(/[^a-z0-9]/g, '').slice(0, 5);
  return safe || 'bin';
}

/** True only for a file that lives in OUR assignments bucket on OUR Supabase
   project: the one URL shape saveBoard will store in a row. This makes
   "never base64, never a foreign hotlink" an enforced rule, not a convention. */
export function isAttachmentUrl(src) {
  if (typeof src !== 'string' || !src || src.length > 2048) return false;
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return false;
  const uploads = `${base}/storage/v1/object/public/${BUCKET}/`;
  const signed = `${base}/storage/v1/object/sign/${BUCKET}/`;
  return src.startsWith(uploads) || src.startsWith(signed);
}

/* ----------------------------------------------------------------------
   Legacy rows held whole files as data: URLs inside items. Every read
   strips them - those payloads are what made each reload take seconds -
   and, when it can, moves them to Storage first so nothing is lost: the
   bytes upload to the assignments bucket and the row keeps only the public
   URL. Failures are logged and the row keeps its inline copy until a later
   read can finish the move.
   ---------------------------------------------------------------------- */

const INLINE_KEYS = ['images', 'solutionImages'];
const INLINE_SCALAR_KEYS = ['image', 'solutionImage'];

function collectInlineFiles(state) {
  const items = Array.isArray(state.items) ? state.items : [];
  const jobs = [];
  items.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    INLINE_KEYS.forEach((key) => {
      const list = item[key];
      if (!Array.isArray(list)) return;
      list.forEach((src, j) => {
        if (typeof src === 'string' && src.startsWith('data:')) jobs.push({ id: `${i}|${key}|${j}`, src });
      });
    });
    INLINE_SCALAR_KEYS.forEach((key) => {
      const src = item[key];
      if (typeof src === 'string' && src.startsWith('data:')) jobs.push({ id: `${i}|${key}|-1`, src });
    });
  });
  return jobs;
}

/** data:<mime>;base64,<payload> -> public URL in the assignments bucket. */
async function uploadInlineDataUrl(src) {
  const comma = src.indexOf(',');
  if (src.slice(0, 5) !== 'data:' || comma < 0) throw new Error('not a data URL');
  const header = src.slice(5, comma);
  if (!header.toLowerCase().includes(';base64')) throw new Error('inline file is not base64');
  const mime = (header.split(';')[0] || '').toLowerCase();
  const bytes = Buffer.from(src.slice(comma + 1), 'base64');
  if (!bytes.length) throw new Error('inline file is empty');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('inline file exceeds the storage limit');
  const path = `legacy-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.${extForMime(mime)}`;
  const storage = client().storage.from(BUCKET);
  const { error } = await storage.upload(path, bytes, {
    contentType: mime || 'application/octet-stream',
    cacheControl: '3600000',
    upsert: false,
  });
  if (error) throw error;
  const { data } = storage.getPublicUrl(path);
  if (!data || !data.publicUrl) throw new Error('Storage returned no public URL');
  return data.publicUrl;
}

/** Serialises concurrent readers so two polling clients never upload the same
   inline file twice inside one instance. */
let inlineMigration = Promise.resolve();

function migrateInlineFiles(state) {
  const run = inlineMigration.then(
    () => migrateInlineNow(state),
    () => migrateInlineNow(state),
  );
  inlineMigration = run.then(() => undefined, () => undefined);
  return run;
}

async function migrateInlineNow(state) {
  const jobs = collectInlineFiles(state);
  if (!jobs.length) return state;

  const moved = new Map();
  for (const job of jobs) {
    try {
      moved.set(job.id, await uploadInlineDataUrl(job.src));
    } catch (err) {
      console.error('[api/_db] inline file move to Storage failed:', describeError(err).message);
    }
  }

  /* keepFailures=true  -> the stored document (moved URLs, unmovable originals)
     keepFailures=false -> what the client sees (moved URLs only; a file whose
     move failed stays in the row for the next attempt but never reaches a
     response, so reads stay text sized either way). */
  function project(item, i, keepFailures) {
    if (!item || typeof item !== 'object') return item;
    const out = { ...item };
    INLINE_KEYS.forEach((key) => {
      if (!Array.isArray(out[key])) return;
      const next = [];
      out[key].forEach((src, j) => {
        if (!(typeof src === 'string' && src.startsWith('data:'))) {
          next.push(src);
          return;
        }
        const url = moved.get(`${i}|${key}|${j}`);
        if (url) next.push(url);
        else if (keepFailures) next.push(src);
      });
      out[key] = next;
    });
    INLINE_SCALAR_KEYS.forEach((key) => {
      const src = out[key];
      if (typeof src !== 'string' || !src.startsWith('data:')) return;
      const url = moved.get(`${i}|${key}|-1`);
      if (url) out[key] = url;
      else if (!keepFailures) delete out[key];
    });
    return out;
  }

  const items = state.items;
  const dbState = { ...state, items: items.map((item, i) => project(item, i, true)) };
  const responseState = { ...state, items: items.map((item, i) => project(item, i, false)) };
  if (moved.size) await writeState(dbState);
  return responseState;
}

/** The whole class document. One row keeps the sync model honest: one shared copy.
   No row yet is normal, it returns the empty shape rather than failing.
   Inline file payloads never leave this function: they are moved to Storage
   (best effort) and the returned state carries only short URLs, so a board
   read is text sized no matter what an old row still contains. */
export async function readState() {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
  if (error) throw error;
  const doc = data && data.data && typeof data.data === 'object' ? data.data : {};
  const state = { ...EMPTY, ...doc };
  return migrateInlineFiles(state);
}

/* File storage note: attachments live in the Supabase Storage bucket
   "assignments". Rows only ever hold the bucket's public URL (checked by
   isAttachmentUrl() on every write), and readState() moves any inline payload
   an old row still carries out to Storage. There is no storage_files table and
   no separate metadata row: the board document is the index. */

/**
 * What the browser is allowed to see. The shared document keeps whatever the
 * server needs, but only these whitelisted fields ever leave: no password and no
 * hash, no session material, no server configuration. Everything else is
 * dropped rather than filtered, so a field added later cannot leak by default.
 */
export function publicState(state) {
  const src = state && typeof state === 'object' ? state : {};
  const accounts = Array.isArray(src.accounts) ? src.accounts : [];
  const config = src.config && typeof src.config === 'object' ? src.config : {};
  const attendance = Array.isArray(src.attendance) ? src.attendance : [];
  return {
    items: Array.isArray(src.items) ? src.items : [],
    config: {
      classCode: typeof config.classCode === 'string' ? config.classCode : '',
      subjects: Array.isArray(config.subjects) ? config.subjects : [],
      theme: typeof config.theme === 'string' ? config.theme : 'system',
    },
    accounts: accounts.map(publicAccount),
    attendance: attendance.slice(0, 200).map((entry) => ({
      name: typeof (entry && entry.name) === 'string' ? entry.name : '',
      mode: typeof (entry && entry.mode) === 'string' ? entry.mode : '',
      at: Number(entry && entry.at) || 0,
    })),
  };
}

/** The public half of an account, exactly the fields the UI needs. */
export function publicAccount(account) {
  if (!account || typeof account !== 'object') return account;
  return {
    id: account.id,
    username: account.username,
    role: account.role === 'admin' ? 'admin' : 'student',
    createdAt: Number(account.createdAt) || 0,
    lastSeen: Number(account.lastSeen) || 0,
  };
}

export function publicAccounts(list) {
  return (Array.isArray(list) ? list : []).map(publicAccount);
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

/* ---- sessions -----------------------------------------------------------
   A sign in mints a random token. The browser only ever holds it in an
   HttpOnly cookie it cannot read; the database keeps just its SHA-256, so
   neither a database dump nor any script in the page can recover a usable
   session. Two clocks bound every session: an absolute lifetime and an idle
   timeout, both enforced here on each request instead of trusted from the
   client. The role is reloaded from the board on every call, so a demotion
   takes effect at the next request rather than at the next login. */

const SESSIONS_TABLE = 'class_sessions';
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;

export function sessionMaxAgeSeconds() {
  return Math.floor(SESSION_ABSOLUTE_MS / 1000);
}

function sessions() {
  return client().from(SESSIONS_TABLE);
}

/** Mints a session for an account. Returns the raw token exactly once, for the
    Set-Cookie header; only its hash is ever written to the database. */
export async function createSession(accountId, meta) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const row = {
    account_id: String(accountId),
    token_hash: hashToken(token),
    created_at: new Date(now).toISOString(),
    last_seen: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_ABSOLUTE_MS).toISOString(),
    user_agent: String((meta && meta.userAgent) || '').slice(0, 200),
    ip: String((meta && meta.ip) || '').slice(0, 64),
  };
  const { error } = await sessions().insert(row);
  if (error) throw error;
  return { token, expiresAt: row.expires_at };
}

/** Looks a session up by token hash, enforcing both clocks. An expired session
    is deleted on the spot so it cannot linger. */
export async function findSession(token) {
  if (!token) return null;
  const hash = hashToken(token);
  const { data, error } = await sessions().select('*').eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const now = Date.now();
  const expiresAt = Date.parse(data.expires_at);
  const lastSeen = Date.parse(data.last_seen);
  if (!Number.isFinite(expiresAt) || now > expiresAt) {
    await sessions().delete().eq('token_hash', hash);
    return null;
  }
  if (!Number.isFinite(lastSeen) || now - lastSeen > SESSION_IDLE_MS) {
    await sessions().delete().eq('token_hash', hash);
    return null;
  }
  if (now - lastSeen > SESSION_TOUCH_MS) {
    /* Slides the idle window forward, at most once per touch interval so an
       active page does not write a row on every request. */
    try {
      await sessions().update({ last_seen: new Date(now).toISOString() }).eq('token_hash', hash);
    } catch (err) {
      /* a failed touch only shortens the session, never opens it */
    }
  }
  return data;
}

/** Invalidates one session. Best effort: a failed delete still clears the
    cookie, and the row ages out through its own expiry either way. */
export async function destroySession(token) {
  if (!token) return;
  try {
    await sessions().delete().eq('token_hash', hashToken(token));
  } catch (err) {
    /* the session expires on its own if the delete cannot land */
  }
}

/** After a password change: every other device is signed out, the device that
    changed the password stays signed in. */
export async function destroyOtherSessions(accountId, keepToken) {
  try {
    let query = sessions().delete().eq('account_id', String(accountId));
    if (keepToken) query = query.neq('token_hash', hashToken(keepToken));
    await query;
  } catch (err) {
    /* old sessions still expire on their own clocks */
  }
}

/** After an admin resets someone's password: that account is signed out
    everywhere, because the reset exists precisely because the old credential
    should no longer work. */
export async function destroySessionsFor(accountId) {
  try {
    await sessions().delete().eq('account_id', String(accountId));
  } catch (err) {
    /* expiry is the backstop */
  }
}

/**
 * Resolves the caller from the session cookie alone. Nothing the browser sent
 * about identity is believed: the account is looked up on the board by the
 * session's account_id, and its role is whatever the board says right now.
 *
 * Returns { ok: true, account, token } or { ok: false, status, reason } where
 * status is 401 for "no valid session" and 503 when the board itself cannot be
 * reached (a refusal to guess rather than an accidental allow).
 */
export async function authenticate(req) {
  const token = sessionTokenFrom(req);
  if (!token) return { ok: false, status: 401, reason: 'Sign in to continue.' };
  let row;
  try {
    row = await findSession(token);
  } catch (err) {
    console.error('[api] session lookup failed', err && err.message);
    return { ok: false, status: 503, reason: 'The class board is unavailable right now.' };
  }
  if (!row) return { ok: false, status: 401, reason: 'Your session has expired. Sign in again.' };
  const state = (await readState()) || {};
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const account = accounts.find((a) => String(a && a.id) === String(row.account_id));
  if (!account) {
    await destroySession(token);
    return { ok: false, status: 401, reason: 'That login no longer exists.' };
  }
  return { ok: true, account, token, session: row };
}

/** Session first, then the role, loaded from the board. 401 when there is no
    session, 403 when there is one but it is not an admin. */
export async function requireAdmin(req) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth;
  if (auth.account.role !== 'admin') {
    return { ok: false, status: 403, reason: 'Only an admin can change the board.' };
  }
  return auth;
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