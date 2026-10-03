import { createClient } from '@supabase/supabase-js';

/**
 * The one place that talks to Supabase. Only these serverless functions ever hold
 * the service role key, so the browser never ships a database credential.
 *
 * Set on Vercel (Project Settings, Environment Variables):
 *   SUPABASE_URL              https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY the service_role key from Project Settings, API
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

/** The whole class document. One row keeps the sync model honest: one shared copy. */
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
