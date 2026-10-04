import { appendAttendance, authorise, broadcastChange, countPlainPasswords, describeError, isConfigured, readState, writeState } from './_db.js';

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

const ADMIN_ONLY = new Set(['saveBoard', 'saveConfig', 'saveAccounts', 'hashPasswords']);

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
  if (!ADMIN_ONLY.has(type) && type !== 'attendance' && type !== 'checkLogin' && type !== 'enrol') {
    return res.status(400).json({ ok: false, reason: `Unknown action "${type}".` });
  }

  if (type === 'enrol') {
    /* A classmate joining with the class code. There is no account to check yet,
       so the code is the whole gate. The password is hashed on the way into the
       row by writeState and is never echoed back here. */
    const name = String((payload && payload.username) || '').replace(/\s+/g, ' ').trim();
    const pass = String((payload && payload.password) || '');
    if (name.length < 2 || name.length > 24) {
      return res.status(400).json({ ok: false, reason: 'Usernames need 2 to 24 characters.' });
    }
    if (pass.length < 4) {
      return res.status(400).json({ ok: false, reason: 'Use at least 4 characters for a password.' });
    }
    const state = (await readState()) || {};
    const code = String((state.config && state.config.classCode) || '');
    const given = String((payload && payload.code) || '').trim().toLowerCase();
    if (!code || given !== code.trim().toLowerCase()) {
      return res.status(403).json({ ok: false, reason: 'That class code is not right.' });
    }
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    if (accounts.some((a) => String(a.username || '').toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ ok: false, reason: 'That username is already taken.' });
    }
    const fresh = {
      id: 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      username: name,
      password: pass,
      role: 'student',
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };
    await writeState({ ...state, accounts: [...accounts, fresh] });
    await broadcastChange('enrol');
    const { password, ...safe } = fresh;
    return res.status(200).json({ ok: true, account: safe });
  }

  try {
    const verdict = await authorise(account, ADMIN_ONLY.has(type));
    if (!verdict.ok) {
      return res.status(403).json({ ok: false, reason: verdict.reason });
    }

    if (type === 'checkLogin') {
      /* Confirms a password the browser typed against the copy that lives on the board.
         Nothing is written and nothing is broadcast. The caller already knows the
         password, so the response carries only the fields it needs to remember. */
      const adminOnly = Boolean(payload && payload.adminOnly);
      const verdict = await authorise(account, adminOnly);
      if (!verdict.ok) {
        return res.status(403).json({ ok: false, reason: verdict.reason });
      }
      return res.status(200).json({
        ok: true,
        account: {
          id: verdict.account.id,
          username: verdict.account.username,
          role: verdict.account.role,
          createdAt: verdict.account.createdAt,
          lastSeen: verdict.account.lastSeen,
        },
      });
    }

    if (type === 'hashPasswords') {
      /* The one-time migration. writeState hashes on the way in, so simply saving
         the document back is what upgrades it. Admin only, and safe to repeat. */
      const state = (await readState()) || {};
      const before = countPlainPasswords(state);
      await writeState(state);
      const after = (await readState()) || {};
      return res.status(200).json({ ok: true, upgraded: before, remaining: countPlainPasswords(after) });
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