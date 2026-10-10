import { appendAttendance, authenticate, broadcastChange, describeError, isAttachmentUrl, isConfigured, readState, requireAdmin, writeState } from './_db.js';
import { guardWrite, isPlainObject, rateLimit, rateLimited, send } from './_security.js';

/**
 * POST /api/action   { type, payload }
 *
 * The board's state changing endpoint, rewritten around sessions:
 *
 *   saveBoard    { items }          the whole assignment board (admin)
 *   saveConfig   { classCode, subjects, theme }   class settings (admin)
 *   attendance   { name, mode, at } a signed in classmate opened the quiz
 *
 * Authentication is the HttpOnly session cookie and nothing else: the request
 * body is never asked who the caller is. The role is reloaded from the board on
 * every call, so a browser that edits its own state gains nothing. Payloads are
 * validated against strict schemas field by field, unknown fields are rejected
 * rather than stored, and each write is rate limited per account.
 *
 * The board stays a single replaceable document on purpose: deletes travel as a
 * shorter list and the client side tombstones stop an older poll from putting a
 * card back, which is the sync model this app was built on. What changed is
 * that the server now decides who may replace it and what the replacement is
 * allowed to contain.
 *
 * Removed types: checkLogin and enrol moved to /api/auth (the password no
 * longer travels with board writes), hashPasswords is gone (every write hashes
 * on the way in).
 */

const TYPES = new Set(['saveBoard', 'saveConfig', 'attendance']);
const ADMIN_ONLY = new Set(['saveBoard', 'saveConfig']);
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['pending', 'in-progress', 'completed']);
const MAX_IMAGES = 6;
const MAX_ITEMS = 300;

const ITEM_KEYS = new Set([
  'id', 'subject', 'title', 'description', 'solution', 'dueDate', 'status',
  'ownerId', 'ownerName', 'images', 'solutionImages', 'createdAt', 'updatedAt',
]);
const CONFIG_KEYS = new Set(['classCode', 'subjects', 'theme']);
const THEMES = new Set(['light', 'dark', 'system']);

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['POST']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  for (const key of Object.keys(body)) {
    if (key !== 'type' && key !== 'payload') {
      return send(res, 400, { ok: false, reason: `Unknown field "${key}".` });
    }
  }

  const type = typeof body.type === 'string' ? body.type : '';
  if (!TYPES.has(type)) {
    return send(res, 400, { ok: false, reason: `Unknown action "${type || ''}".` });
  }

  /* Who is asking, from the cookie alone. 401 without a session, 403 when the
     session is real but the role is not enough for this action. */
  const auth = ADMIN_ONLY.has(type) ? await requireAdmin(req) : await authenticate(req);
  if (!auth.ok) return send(res, auth.status || 401, { ok: false, reason: auth.reason });

  const gate = rateLimit('write:' + auth.account.id, RATE_MAX, RATE_WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  try {
    if (type === 'saveBoard') {
      const items = sanitiseBoard(body.payload);
      if (items.reason) return send(res, 400, { ok: false, reason: items.reason });
      const state = (await readState()) || {};
      await writeState({ ...state, items: items.value });
      await broadcastChange('saveBoard');
      return send(res, 200, { ok: true, syncedAt: Date.now() });
    }

    if (type === 'saveConfig') {
      const config = sanitiseConfig(body.payload);
      if (config.reason) return send(res, 400, { ok: false, reason: config.reason });
      const state = (await readState()) || {};
      /* Only the three known keys are written back, so a legacy document that
         once carried a password or an embedded account list is scrubbed by the
         next save rather than kept alive. */
      await writeState({ ...state, config: config.value });
      await broadcastChange('saveConfig');
      return send(res, 200, { ok: true, syncedAt: Date.now() });
    }

    /* attendance: any signed in account */
    const entry = sanitiseAttendance(body.payload);
    if (entry.reason) return send(res, 400, { ok: false, reason: entry.reason });
    await appendAttendance(entry.value);
    await broadcastChange('attendance');
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('[api/action] write failed', type, JSON.stringify(describeError(err)));
    return send(res, 500, { ok: false, reason: 'Could not save to the class board.' });
  }
}

/* ---- schemas -----------------------------------------------------------
   Every function returns { value } on success or { reason } on rejection.
   Values are rebuilt field by field: nothing the client sent is spread into
   storage, so an unexpected key can neither be stored nor travel further. */

function str(value, max, min) {
  if (typeof value !== 'string') return null;
  const out = value.replace(/\s+/g, ' ').trim();
  if (out.length < (min || 0) || out.length > max) return null;
  return out;
}

function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 4e13) return null;
  return n;
}

/* Attachment lists are URL lists. Files live in the assignments Storage
   bucket, so a row can only ever point at our own Storage (public or signed):
   inline base64 and foreign hotlinks are refused at the door, which is what
   keeps the document text sized and a card read instant. */
function imageList(value) {
  if (!Array.isArray(value) || value.length > MAX_IMAGES) return null;
  const out = [];
  for (const src of value) {
    if (!isAttachmentUrl(src)) return null;
    out.push(src);
  }
  return out;
}

function sanitiseBoard(payload) {
  if (!Array.isArray(payload)) return { reason: 'A board must be a list of assignments.' };
  if (payload.length > MAX_ITEMS) return { reason: 'That board has too many assignments.' };
  const items = [];
  for (const raw of payload) {
    if (!isPlainObject(raw)) return { reason: 'Every assignment must be an object.' };
    for (const key of Object.keys(raw)) {
      if (!ITEM_KEYS.has(key)) return { reason: `Unknown assignment field "${key}".` };
    }
    if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) return { reason: 'An assignment id is not valid.' };
    const subject = str(raw.subject, 80, 1);
    const title = str(raw.title, 300, 1);
    const description = typeof raw.description === 'string' && raw.description.length <= 10000 ? raw.description : null;
    const solution = typeof raw.solution === 'string' && raw.solution.length <= 30000 ? raw.solution : null;
    const dueDate = typeof raw.dueDate === 'string' ? raw.dueDate : null;
    if (dueDate === null || (dueDate !== '' && !DATE_PATTERN.test(dueDate))) {
      return { reason: 'A due date is not a valid date.' };
    }
    if (!STATUSES.has(raw.status)) return { reason: 'A status is not one of the known values.' };
    const ownerId = typeof raw.ownerId === 'string' && (raw.ownerId === '' || ID_PATTERN.test(raw.ownerId)) ? raw.ownerId : null;
    if (ownerId === null) return { reason: 'An owner id is not valid.' };
    const ownerName = typeof raw.ownerName === 'string' && raw.ownerName.length <= 40 ? raw.ownerName : null;
    if (ownerName === null) return { reason: 'An owner name is not valid.' };
    const inline = [
      ...(Array.isArray(raw.images) ? raw.images : []),
      ...(Array.isArray(raw.solutionImages) ? raw.solutionImages : []),
    ].some((src) => typeof src === 'string' && src.startsWith('data:'));
    if (inline) {
      return { reason: 'Inline base64 pictures are no longer stored - upload the file and send its Storage link.' };
    }
    const images = imageList(raw.images);
    if (images === null) return { reason: 'The pictures of an assignment are not valid.' };
    const solutionImages = imageList(raw.solutionImages);
    if (solutionImages === null) return { reason: 'The answer pictures of an assignment are not valid.' };
    const createdAt = num(raw.createdAt);
    if (createdAt === null) return { reason: 'An assignment timestamp is not valid.' };

    const item = {
      id: raw.id,
      subject,
      title,
      description,
      solution,
      dueDate,
      status: raw.status,
      ownerId,
      ownerName,
      images,
      solutionImages,
      createdAt,
    };
    if (raw.updatedAt !== undefined) {
      const updatedAt = num(raw.updatedAt);
      if (updatedAt === null) return { reason: 'An assignment timestamp is not valid.' };
      item.updatedAt = updatedAt;
    }
    items.push(item);
  }
  return { value: items };
}

function sanitiseConfig(payload) {
  if (!isPlainObject(payload)) return { reason: 'A config must be an object.' };
  for (const key of Object.keys(payload)) {
    if (!CONFIG_KEYS.has(key)) return { reason: `Unknown config field "${key}".` };
  }
  const classCode = typeof payload.classCode === 'string' ? payload.classCode.trim() : '';
  if (!classCode || classCode.length > 24 || !/^[A-Za-z0-9 _-]+$/.test(classCode)) {
    return { reason: 'The class code can be 1 to 24 letters, numbers, spaces, dashes or underscores.' };
  }
  if (!Array.isArray(payload.subjects)) return { reason: 'Subjects must be a list.' };
  if (payload.subjects.length > 60) return { reason: 'That is too many subjects.' };
  const subjects = [];
  for (const raw of payload.subjects) {
    const name = str(raw, 60, 1);
    if (!name) return { reason: 'A subject name is not valid.' };
    if (!subjects.some((s) => s.toLowerCase() === name.toLowerCase())) subjects.push(name);
  }
  const theme = payload.theme === undefined ? 'system' : payload.theme;
  if (!THEMES.has(theme)) return { reason: 'Theme must be light, dark or system.' };
  return { value: { classCode, subjects, theme } };
}

function sanitiseAttendance(payload) {
  if (!isPlainObject(payload)) return { reason: 'Attendance must be an object.' };
  for (const key of Object.keys(payload)) {
    if (key !== 'name' && key !== 'mode' && key !== 'at') {
      return { reason: `Unknown field "${key}".` };
    }
  }
  const name = str(payload.name, 40, 1);
  if (!name) return { reason: 'A name is required.' };
  const mode = str(payload.mode, 24, 1);
  if (!mode) return { reason: 'A mode is required.' };
  const at = payload.at === undefined ? Date.now() : num(payload.at);
  if (at === null) return { reason: 'That timestamp is not valid.' };
  return { value: { name, mode, at } };
}
