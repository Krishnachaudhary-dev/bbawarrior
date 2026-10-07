import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Request level protection shared by every endpoint: cookie parsing, the origin
 * check that stands in for a CSRF token, a small in memory rate limiter, and the
 * body size ceiling. No secrets live here, only policy.
 *
 * Everything is deliberately dependency free so the functions behave the same on
 * Vercel and in the local test harness.
 */

export const SESSION_COOKIE = 'bba_session';
export const MAX_BODY_BYTES = 4.4 * 1024 * 1024; /* Vercel caps function bodies at 4.5MB */

/* ---- cookies ---------------------------------------------------------- */

export function parseCookies(req) {
  const header = (req.headers && (req.headers.cookie || req.headers.Cookie)) || '';
  const out = {};
  String(header)
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx < 1) return;
      const key = part.slice(0, idx).trim();
      if (!key) return;
      try {
        out[key] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch (err) {
        out[key] = part.slice(idx + 1).trim();
      }
    });
  return out;
}

export function sessionTokenFrom(req) {
  const value = parseCookies(req)[SESSION_COOKIE];
  return value && /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
}

/** Builds the Set-Cookie header. HttpOnly so JavaScript never sees the secret,
    SameSite=Lax so a cross site POST never carries it, Secure in production. */
export function sessionCookie(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ];
  /* localhost and the local harness are plain http, where a Secure cookie is
     dropped by the browser. The real deployment is always https. */
  if (process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIE === '1') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ---- origin check (CSRF) --------------------------------------------- */

/**
 * A state changing request from a browser always carries Origin (and most carry
 * Referer). If one is present it must match this deployment; if neither is
 * present the request did not come from a browser context that could hold the
 * cookie, so there is no CSRF risk to check. Combined with SameSite=Lax this
 * covers POST without needing a token round trip.
 */
export function originAllowed(req) {
  const headers = (req.headers || {});
  const host = String(headers.host || '').toLowerCase();
  if (!host) return true; /* no virtual host info to compare against */
  const raw = headers.origin || headers.referer || headers.Origin || headers.Referer;
  if (!raw) return true;
  let candidate = String(raw);
  if (candidate === 'null') return false;
  try {
    if (!/^https?:\/\//i.test(candidate)) candidate = 'https://' + candidate;
    candidate = new URL(candidate).host.toLowerCase();
  } catch (err) {
    return false;
  }
  return candidate === host;
}

/* ---- client address --------------------------------------------------- */

export function clientIp(req) {
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
  if (fwd) {
    const first = String(fwd).split(',')[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ---- rate limiting ----------------------------------------------------
   A fixed window per key, kept in the warm instance. Serverless instances do
   not share memory, so this throttles a single attacker connection stream hard
   while a distributed attacker could still hit other instances: noted in the
   security report as a known limit of this design without a shared store. */

const buckets = new Map();
const MAX_BUCKETS = 10000;

export function rateLimit(key, max, windowMs, now = Date.now()) {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size <= MAX_BUCKETS / 2) break;
    }
    if (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: max - bucket.count, retryAfter: 0 };
}

/** Called after a success so one correct answer clears the strike count. */
export function rateReset(key) {
  buckets.delete(key);
}

/* ---- input helpers ---------------------------------------------------- */

export function tooLarge(req) {
  const len = req.headers && (req.headers['content-length'] || req.headers['Content-Length']);
  if (len && Number(len) > MAX_BODY_BYTES) return true;
  if (typeof req.body === 'string' && req.body.length > MAX_BODY_BYTES) return true;
  return false;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Trims and bounds a string field. Returns null when the value is not a string
    or does not fit, so a caller can reject instead of storing junk. */
export function cleanString(value, max, { trim = true, min = 0 } = {}) {
  if (typeof value !== 'string') return null;
  let out = trim ? value.replace(/\s+/g, ' ').trim() : value;
  if (trim && out.length > max) out = out.slice(0, max);
  if (out.length < min) return null;
  if (out.length > max) return null;
  return out;
}

/** The narrow shape of a username: 2 to 24 characters after collapsing spaces. */
export function cleanUsername(value) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > 24) return null;
  if (!/^[\p{L}\p{N} ._'@-]+$/u.test(name)) return null;
  return name;
}

/** New passwords: 8 to 200 characters. Existing shorter passwords keep working
    until the owner changes them; only new ones are held to the stronger rule. */
export function cleanNewPassword(value) {
  if (typeof value !== 'string') return null;
  if (value.length < 8 || value.length > 200) return null;
  return value;
}

export const ROLES = new Set(['admin', 'student']);

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Constant time string compare for values that are not already hashed. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/* ---- response helpers -------------------------------------------------- */

/** Every answer from this API is no-store: a session or board response that
    lands in a shared cache would outlive the thing it describes. */
export function send(res, status, body) {
  res.setHeader && res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader && res.setHeader('Allow', allowed.join(', '));
  send(res, 405, { ok: false, reason: `Use ${allowed.join(' or ')}.` });
  return false;
}

/** Shared preamble for every state changing endpoint: method, size, origin.
    Returns null when the request may proceed, or a response that was already
    sent. */
export function guardWrite(req, res, allowedMethods) {
  if (!methodGuard(req, res, allowedMethods)) return { done: true };
  if (tooLarge(req)) {
    send(res, 413, { ok: false, reason: 'That request is too large.' });
    return { done: true };
  }
  if (!originAllowed(req)) {
    send(res, 403, { ok: false, reason: 'Request blocked: it did not come from this site.' });
    return { done: true };
  }
  return { done: false };
}

/** 429 with a Retry-After header, in the shape every endpoint uses. */
export function rateLimited(res, retryAfterSeconds) {
  res.setHeader && res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds || 1)));
  return send(res, 429, {
    ok: false,
    rateLimited: true,
    reason: 'Too many attempts. Try again in a minute.',
  });
}
