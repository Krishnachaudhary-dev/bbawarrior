import { appendAttendance, authorise, broadcastChange, describeError, isConfigured, readState, writeState } from './_db.js';

/**
 * POST /api/action
 * Body: { type, payload, account: { id, password } }
 *
 *   saveBoard    { items }            the whole board, so a delete removes it everywhere
 *   saveConfig   { config }           class code and subjects
 *   saveAccounts { accounts }         the class logins
 *   attendance   { name, mode, at }   someone opened the quiz
 *
 * The first three belong to an admin and are refused for anyone else, checked
 * against the logins on the board rather than anything the caller asserts about
 * itself. Attendance needs a real login but not an admin one, because it records
 * that a classmate turned up and changes nothing anybody can edit.
 *
 * Whichever device posts last wins for that slice of the document. That is the
 * point: an admin deleting an assignment posts the shorter board and every other
 * device adopts it on its next sync.
 */

const ADMIN_ONLY = new Set(['saveBoard', 'saveConfig', 'saveAccounts']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'Use POST.' });
  }

  if (!isConfigured()) {
    return res.status(200).json({ ok: false, offline: true });
  }

  const { type, payload, account } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, reason: 'Missing action type.' });
  if (!ADMIN_ONLY.has(type) && type !== 'attendance') {
    return res.status(400).json({ ok: false, reason: `Unknown action "${type}".` });
  }

  try {
    const verdict = await authorise(account, ADMIN_ONLY.has(type));
    if (!verdict.ok) {
      return res.status(403).json({ ok: false, reason: verdict.reason });
    }

    if (type === 'attendance') {
      const next = await appendAttendance(payload || {});
      await broadcastChange('attendance');
      return res.status(200).json({ ok: true, attendance: next.attendance });
    }

    const state = (await readState()) || {};
    const next = { ...state };

    if (type === 'saveBoard') next.items = Array.isArray(payload) ? payload : [];
    else if (type === 'saveConfig') next.config = { ...(state.config || {}), ...(payload || {}) };
    else if (type === 'saveAccounts') next.accounts = Array.isArray(payload) ? payload : [];

    await writeState(next);
    /* Everyone else is told to come and look, without being told what changed. */
    await broadcastChange(type);
    return res.status(200).json({ ok: true, syncedAt: Date.now() });
  } catch (err) {
    console.error('[api/action] write failed', type, JSON.stringify(describeError(err)));
    return res.status(500).json({ ok: false, reason: 'Could not save to the class board.' });
  }
}