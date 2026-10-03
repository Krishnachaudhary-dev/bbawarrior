import { createClient } from '@supabase/supabase-js';

/**
 * The one place that talks to Supabase. Only these serverless functions ever hold
 * the service role key, so the browser never ships a database credential.
 *
 * Set on Vercel (Project Settings, Environment Variables):
 *   SUPABASE_URL               https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  the service_role key from Project Settings, API
 *   SUPABASE_ANON_KEY          the anon key, handed to the browser for the
 *                              realtime doorbell only. It is public by design and
 *                              row level security still refuses it.
 */

const TABLE = 'class_state';
const ROW_ID = 'section-h';

export function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
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
  return {
    name: err.name || null,
    code: err.code || null,
    status: err.status || null,
    message: err.message || String(err),
    details: err.details || null,
    hint: err.hint || null,
  };
}

/**
 * Reads the role out of a legacy Supabase key so a pasted anon key is obvious.
 * The payload is only decoded, never verified, and the key itself is never
 * printed or returned.
 */
export function keyRoleHint(key) {
  if (!key) return null;
  if (!key.startsWith('eyJ')) return 'new style key, sb_secret_...';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    return payload.role || 'legacy key, role not stated';
  } catch (err) {
    return 'legacy key, role could not be read';
  }
}

/**
 * Everything GET /api/health reports. One request tells you whether the problem
 * is a missing variable, the wrong key, the wrong URL, or the table itself.
 */
export async function diagnose() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const report = {
    configured: { url: Boolean(url), serviceKey: Boolean(key), anonKey: Boolean(process.env.SUPABASE_ANON_KEY) },
    urlLooksLikeProjectUrl: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim()),
    keyRole: keyRoleHint(key.trim()),
    table: TABLE,
    rowId: ROW_ID,
    reachable: false,
    rows: null,
    error: null,
  };

  if (!report.configured.url || !report.configured.serviceKey) {
    report.error = { message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in this deployment.' };
    return report;
  }

  try {
    /* count: 'exact' with head: true asks for the row count without fetching rows,
       so this stays cheap and proves the service role can reach the table. */
    const { count, error } = await client()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('id', ROW_ID);
    report.reachable = !error;
    report.rows = count;
    report.error = error ? describeError(error) : null;
  } catch (err) {
    report.error = describeError(err);
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
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
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

/** Replaces the document. An admin deleting an assignment lands here for everyone. */
export async function writeState(next) {
  if (!isConfigured()) return false;
  const { error } = await client().from(TABLE).upsert({ id: ROW_ID, data: next, updated_at: new Date().toISOString() });
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
  if (!sameSecret(found.password, claims.password)) return { ok: false, reason: 'That password is not right.' };
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