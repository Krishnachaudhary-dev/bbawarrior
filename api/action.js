import { appendAttendance, describeError, isConfigured, readState, writeState } from './_db.js';

/**
 * POST /api/action
 * Body: { type, payload }
 *
 *   saveBoard    { items }            the whole board, so a delete removes it everywhere
 *   saveConfig   { config }           class code and subjects
 *   saveAccounts { accounts }         the class logins
 *   attendance   { name, mode, at }   someone opened the quiz
 *
 * Whichever device posts last wins for that slice of the document. That is the
 * point: an admin deleting an assignment posts the shorter board and every other
 * device adopts it on its next poll.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'Use POST.' });
  }

  if (!isConfigured()) {
    return res.status(200).json({ ok: false, offline: true });
  }

  const { type, payload } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, reason: 'Missing action type.' });

  try {
    if (type === 'attendance') {
      const next = await appendAttendance(payload || {});
      return res.status(200).json({ ok: true, attendance: next.attendance });
    }

    const state = (await readState()) || {};
    const next = { ...state };

    if (type === 'saveBoard') next.items = Array.isArray(payload) ? payload : [];
    else if (type === 'saveConfig') next.config = { ...(state.config || {}), ...(payload || {}) };
    else if (type === 'saveAccounts') next.accounts = Array.isArray(payload) ? payload : [];
    else return res.status(400).json({ ok: false, reason: `Unknown action "${type}".` });

    await writeState(next);
    return res.status(200).json({ ok: true, syncedAt: Date.now() });
  } catch (err) {
    console.error('[api/action] write failed', type, JSON.stringify(describeError(err)));
    return res.status(500).json({ ok: false, reason: 'Could not save to the class board.' });
  }
}