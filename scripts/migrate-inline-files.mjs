/**
 * One-time cleanup: move any legacy inline base64 files still sitting in the
 * class_state row out to the assignments Storage bucket, so the row holds only
 * lightweight public URLs.
 *
 * This is the same migration the request path (readState) performs lazily, but
 * run eagerly and offline so that:
 *   - the first post-deploy page load does not pay the upload cost, and
 *   - a row whose migration kept failing is cleaned up in one deliberate pass.
 *
 * It rewrites ONLY the `items` key. `accounts` (which carries password hashes)
 * and every other key are copied through byte-for-byte, and passwords are never
 * re-hashed here — this is a storage-shape fix, not an auth operation.
 *
 * Usage (reads SUPABASE_URL / SUPABASE_SECRET_KEY from the environment or .env):
 *   node scripts/migrate-inline-files.mjs            # apply
 *   node scripts/migrate-inline-files.mjs --dry-run  # report only, change nothing
 *
 * Exit codes: 0 = row is clean (or was cleaned), 1 = could not run or something
 * is still inline afterwards.
 */
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/* ---- environment ------------------------------------------------------- */
/* Vercel sets these in the deployment; locally they come from .env (gitignored). */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const envText = readFileSync(path.join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  /* no .env: rely on the real environment */
}

const URL = String(process.env.SUPABASE_URL || '').trim();
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY = process.argv.includes('--dry-run');

const TABLE = 'class_state';
const ROW_ID = 'section-h';
const BUCKET = 'assignments';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const INLINE_KEYS = ['images', 'solutionImages'];
const INLINE_SCALAR_KEYS = ['image', 'solutionImage'];

const MIME_EXTENSIONS = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tiff',
};

function extForMime(mime) {
  const type = String(mime || '').toLowerCase().split(';')[0].trim();
  if (MIME_EXTENSIONS[type]) return MIME_EXTENSIONS[type];
  const subtype = type.includes('/') ? type.split('/')[1] : '';
  const safe = subtype.replace(/[^a-z0-9]/g, '').slice(0, 5);
  return safe || 'bin';
}

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

async function uploadInlineDataUrl(storage, src) {
  const comma = src.indexOf(',');
  if (src.slice(0, 5) !== 'data:' || comma < 0) throw new Error('not a data URL');
  const header = src.slice(5, comma);
  if (!header.toLowerCase().includes(';base64')) throw new Error('inline file is not base64');
  const mime = (header.split(';')[0] || '').toLowerCase();
  const bytes = Buffer.from(src.slice(comma + 1), 'base64');
  if (!bytes.length) throw new Error('inline file is empty');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('inline file exceeds the storage limit');
  const filePath = `legacy-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.${extForMime(mime)}`;
  const { error } = await storage.upload(filePath, bytes, {
    contentType: mime || 'application/octet-stream', cacheControl: '3600000', upsert: false,
  });
  if (error) throw error;
  const { data } = storage.getPublicUrl(filePath);
  if (!data || !data.publicUrl) throw new Error('Storage returned no public URL');
  return data.publicUrl;
}

async function main() {
  if (!URL || !KEY) {
    console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set (environment or .env).');
    process.exit(1);
  }
  const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = supabase.storage.from(BUCKET);

  const { data, error } = await supabase.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
  if (error) { console.error('could not read the row:', error.message); process.exit(1); }
  const doc = data && data.data && typeof data.data === 'object' ? data.data : null;
  if (!doc) { console.log('no class_state row yet — nothing to migrate.'); return; }

  const before = collectInlineFiles(doc).length;
  if (!before) {
    console.log(`clean: class_state holds no inline files (${JSON.stringify(doc).length} bytes).`);
    return;
  }
  console.log(`found ${before} inline file(s), ${JSON.stringify(doc).length} bytes total.`);

  if (DRY) {
    for (const job of collectInlineFiles(doc)) {
      console.log(`  - ${job.id}: ${job.src.slice(0, 40)}... (${job.src.length} chars)`);
    }
    console.log('dry run: nothing was changed.');
    return;
  }

  const moved = new Map();
  for (const job of collectInlineFiles(doc)) {
    try {
      moved.set(job.id, await uploadInlineDataUrl(storage, job.src));
      console.log(`  moved ${job.id}`);
    } catch (err) {
      console.error(`  FAILED ${job.id}: ${err.message} (stays inline; re-run to retry)`);
    }
  }

  /* Rewrite only items. accounts and every other key are copied through as-is. */
  const items = Array.isArray(doc.items) ? doc.items.map((it) => ({ ...it })) : [];
  items.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    INLINE_KEYS.forEach((key) => {
      if (!Array.isArray(item[key])) return;
      item[key] = item[key].map((src, j) => (typeof src === 'string' && src.startsWith('data:')
        ? (moved.get(`${i}|${key}|${j}`) || src) : src));
    });
    INLINE_SCALAR_KEYS.forEach((key) => {
      const src = item[key];
      if (typeof src === 'string' && src.startsWith('data:')) {
        const url = moved.get(`${i}|${key}|-1`);
        if (url) item[key] = url;
      }
    });
  });
  const next = { ...doc, items };

  const { error: upErr } = await supabase.from(TABLE)
    .upsert({ id: ROW_ID, data: next, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (upErr) { console.error('could not write the row:', upErr.message); process.exit(1); }

  const left = collectInlineFiles(next).length;
  console.log(`moved ${moved.size} of ${before} file(s); ${left} remain inline.`);
  if (left > 0) {
    console.error('some files could not be moved — re-run to retry the remainder.');
    process.exit(1);
  }
  console.log(`done: class_state now ${JSON.stringify(next).length} bytes, URLs only.`);
}

main().catch((err) => { console.error('cleanup failed:', err.message); process.exit(1); });
