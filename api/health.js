import { diagnose } from './_db.js';

/**
 * GET /api/health
 *
 * The troubleshooting endpoint. Supabase failures come in a handful of shapes and
 * this names which one you have, so nobody has to read a raw driver error:
 *
 *   configured.url false          SUPABASE_URL is not set in this deployment
 *   configured.serviceKey false   no secret key is set, under either name
 *   readFrom.secretKey            which variable the value actually came from,
 *                                 so a renamed or half-set variable is visible
 *   keyRole                        what kind of key it is: secret, publishable, a
 *                                 legacy JWT with its role, or something that is
 *                                 not a key at all
 *   keyFingerprint                prefix, length and four characters, enough to
 *                                 see one mistyped character, never the key
 *   urlLooksLikeProjectUrl false  a pooler, JWKS url or connection string was
 *                                 pasted, not the Project URL
 *   reachable false               the call failed, error carries the detail
 *   reachable true                all good, rows says how many are in the table
 *   remedy                        what to change, present only when something is
 *                                 wrong
 *
 * It prints no key and no account data, only the shape of the configuration.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'Use GET.' });
  }

  try {
    const report = await diagnose();
    res.setHeader('Cache-Control', 'no-store');
    /* ok means the database answered, not that this file ran. A report that says
       ok true with reachable false would be worse than no report at all. */
    return res.status(200).json({ ok: report.reachable, ...report });
  } catch (err) {
    /* diagnose catches its own failures, so reaching here means the check itself
       broke. Say so rather than pretending the database answered. */
    console.error('[api/health] check failed', err);
    return res.status(200).json({ ok: false, reason: 'The health check itself failed.' });
  }
}