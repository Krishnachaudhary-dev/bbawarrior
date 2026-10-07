import {
  broadcastChange,
  destroySessionsFor,
  isConfigured,
  publicAccounts,
  readState,
  requireAdmin,
  writeState,
} from '../../_db.js';
import {
  ROLES,
  cleanUsername,
  clientIp,
  guardWrite,
  rateLimit,
  rateLimited,
  send,
} from '../../_security.js';

/**
 * PATCH  /api/admin/accounts/:id   { username?, role? }
 * DELETE /api/admin/accounts/:id
 *
 * Admin only, session authenticated, one account per call with a strict field
 * allowlist, so a client cannot smuggle extra fields into the stored account.
 * The guards from the old UI are now enforced on the server: usernames stay
 * unique regardless of capitalisation, the last admin cannot be demoted or
 * removed, and an account that still owns assignments cannot be deleted. A
 * rename also rewrites the owner name on every assignment that account posted,
 * and a delete ends that account's sessions immediately.
 */

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PATCH_FIELDS = new Set(['username', 'role']);

export default async function handler(req, res) {
  const guard = guardWrite(req, res, ['PATCH', 'DELETE']);
  if (guard.done) return;

  if (!isConfigured()) {
    return send(res, 503, { ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, auth.status || 403, { ok: false, reason: auth.reason });

  const gate = rateLimit('admin:' + clientIp(req), MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) return rateLimited(res, gate.retryAfter);

  const id = String((req.query && (req.query.id || req.query['id'])) || req.accountIdParam || '');
  if (!ID_PATTERN.test(id)) {
    return send(res, 400, { ok: false, reason: 'That account id is not valid.' });
  }

  try {
    const state = (await readState()) || {};
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const index = accounts.findIndex((a) => String(a && a.id) === id);
    if (index < 0) return send(res, 404, { ok: false, reason: 'That login is not on this board.' });
    const target = accounts[index];
    const admins = accounts.filter((a) => a && a.role === 'admin');
    const isLastAdmin = target.role === 'admin' && admins.length <= 1;

    if (req.method === 'DELETE') {
      if (isLastAdmin) {
        return send(res, 403, { ok: false, reason: 'The class needs at least one admin.' });
      }
      const owns = (Array.isArray(state.items) ? state.items : []).some(
        (item) => item && String(item.ownerId) === id,
      );
      if (owns) {
        return send(res, 409, { ok: false, reason: 'That person still has assignments on the board.' });
      }
      const next = { ...state, accounts: accounts.filter((a) => String(a && a.id) !== id) };
      await writeState(next);
      await destroySessionsFor(id);
      await broadcastChange('accounts');
      return send(res, 200, { ok: true, accounts: publicAccounts(next.accounts) });
    }

    /* PATCH */
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    for (const key of Object.keys(body)) {
      if (!PATCH_FIELDS.has(key)) {
        return send(res, 400, { ok: false, reason: `Unknown field "${key}".` });
      }
    }
    if (body.username === undefined && body.role === undefined) {
      return send(res, 400, { ok: false, reason: 'Nothing to change.' });
    }

    const nextAccounts = accounts.slice();
    let items = state.items;

    if (body.username !== undefined) {
      const username = cleanUsername(body.username);
      if (!username) return send(res, 400, { ok: false, reason: 'Usernames need 2 to 24 characters.' });
      const clash = accounts.some(
        (a, i) =>
          i !== index &&
          a &&
          String(a.username || '').replace(/\s+/g, ' ').trim().toLowerCase() === username.toLowerCase(),
      );
      if (clash) return send(res, 400, { ok: false, reason: 'Someone with that name is already on the list.' });
      nextAccounts[index] = { ...target, username };
      /* The card author line follows the rename, server side, so every device
         sees the same name without a second write from the client. */
      items = (Array.isArray(items) ? items : []).map((item) =>
        item && String(item.ownerId) === id ? { ...item, ownerName: username } : item,
      );
    }

    if (body.role !== undefined) {
      if (!ROLES.has(body.role)) {
        return send(res, 400, { ok: false, reason: 'Role must be admin or student.' });
      }
      if (body.role !== 'admin' && isLastAdmin) {
        return send(res, 403, { ok: false, reason: 'The class needs at least one admin.' });
      }
      nextAccounts[index] = { ...nextAccounts[index], role: body.role };
    }

    const next = { ...state, accounts: nextAccounts, items };
    await writeState(next);
    await broadcastChange('accounts');
    return send(res, 200, { ok: true, accounts: publicAccounts(next.accounts) });
  } catch (err) {
    console.error('[api/admin/accounts] update failed', req.method, err && err.message);
    return send(res, 500, { ok: false, reason: 'Could not update that login.' });
  }
}
