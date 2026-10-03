import { describeError, isConfigured, readState } from './_db.js';

/**
 * GET /api/state
 * The shared class document: class code, the assignment board, the logins and the
 * attendance log. Both the quiz site and the organizer page read this.
 *
 * When Supabase is not configured it reports offline rather than failing, so each
 * app falls back to its own local copy instead of breaking. GET /api/health names
 * the reason when a configured deployment still cannot read.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'Use GET.' });
  }

  if (!isConfigured()) {
    return res.status(200).json({ ok: false, offline: true, reason: 'Shared class storage is not set up yet.' });
  }

  try {
    const state = await readState();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, ...state, syncedAt: Date.now() });
  } catch (err) {
    /* The browser gets a plain sentence, the Vercel log gets the actual failure. */
    console.error('[api/state] read failed', JSON.stringify(describeError(err)));
    return res.status(500).json({ ok: false, reason: 'Could not read the class board.' });
  }
}