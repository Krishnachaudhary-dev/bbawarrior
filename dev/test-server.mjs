import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase } from './fake-supabase.mjs';

/**
 * Local harness: serves the built frontend from dist/, runs the real Vercel
 * serverless functions, and points them at the in-memory fake Supabase.
 *
 *   TEST_PORT=8791 _tools/node/node.exe dev/test-server.mjs
 *
 * The Vercel-style response helpers (res.status().json()), req.query and the
 * parsed req.body are reproduced here so the functions run unmodified.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.TEST_PORT || 8791);
const BASE = `http://127.0.0.1:${PORT}`;

process.env.SUPABASE_URL = `${BASE}/sb`;
process.env.SUPABASE_SECRET_KEY =
  process.env.TEST_SECRET_KEY || 'fake_secret_local-harness-key-0000000000000000000000000000';
process.env.SUPABASE_PUBLISHABLE_KEY = 'fake_publishable_local-harness-key-000000000000000000000000';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

if (!existsSync(DIST)) {
  console.error(`dist/ not found at ${DIST} - run "npm run build" first.`);
  process.exit(1);
}

const fake = createFakeSupabase({ secretKey: process.env.SUPABASE_SECRET_KEY });

/* Handlers are imported after the env vars above are set (top-level statements
   run in order), so every module sees the harness configuration. */
const [health, state, action, login, logout, me, register, changePassword, setup, adminAccounts, adminAccount, resetPassword] =
  await Promise.all([
    import('../api/health.js'),
    import('../api/state.js'),
    import('../api/action.js'),
    import('../api/auth/login.js'),
    import('../api/auth/logout.js'),
    import('../api/auth/me.js'),
    import('../api/auth/register.js'),
    import('../api/auth/change-password.js'),
    import('../api/auth/setup.js'),
    import('../api/admin/accounts/index.js'),
    import('../api/admin/accounts/[id].js'),
    import('../api/admin/accounts/[id]/reset-password.js'),
  ]);

/* The same headers vercel.json configures for production, applied here so the
   tests can assert what production will actually send. */
let vercelHeaders = [];
try {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  vercelHeaders = (manifest.headers || []).flatMap((rule) =>
    (rule.headers || []).map((h) => [h.key, h.value]),
  );
} catch (err) {
  console.error('could not read vercel.json headers:', err.message);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        /* Keep the socket healthy: stop buffering, keep draining, and let the
           handler answer 413 on a clean connection. Destroying the request
           here resets the socket mid-exchange and poisons the client's
           keep-alive pool. */
        oversized = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      buffer.oversized = oversized;
      resolve(buffer);
    });
    req.on('error', reject);
  });
}

const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  let handler = null;
  const query = {};

  const authRoutes = {
    login: login.default,
    logout: logout.default,
    me: me.default,
    register: register.default,
    'change-password': changePassword.default,
    setup: setup.default,
  };
  const topRoutes = {
    health: health.default,
    state: state.default,
    action: action.default,
  };

  if (parts[1] === 'auth') {
    handler = authRoutes[parts[2]] || null;
  } else if (parts[1] === 'admin' && parts[2] === 'accounts' && parts.length >= 4) {
    query.id = decodeURIComponent(parts[3] || '');
    if (parts[4] === 'reset-password') handler = resetPassword.default;
    else handler = adminAccount.default;
  } else if (parts[1] === 'admin' && parts[2] === 'accounts' && parts.length === 3) {
    handler = adminAccounts.default;
  } else {
    handler = topRoutes[parts[1]] || null;
  }

  if (!handler) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ ok: false, reason: 'No such endpoint.' }));
  }

  /* Vercel rejects a malformed JSON body with 400 before the handler runs. */
  let body;
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    const type = String(req.headers['content-type'] || '');
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw.oversized) {
      res.statusCode = 413;
      return res.end(JSON.stringify({ ok: false, reason: 'That request is too large.' }));
    }
    if (type.includes('application/json')) {
      try {
        body = JSON.parse(raw.toString('utf8') || 'null');
      } catch (err) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }));
      }
    } else {
      body = raw.toString('utf8');
    }
  }

  req.query = query;
  req.body = body;
  return handler(req, decorate(res));
}

async function handleStatic(req, res, url) {
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === '/') filePath = '/index.html';
  const resolved = path.join(DIST, filePath);
  let target = resolved;
  if (!resolved.startsWith(DIST) || !existsSync(target) || !path.extname(target)) {
    target = path.join(DIST, 'index.html'); /* SPA rewrite */
  }
  try {
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Powered-By', 'bba-harness');
  for (const [key, value] of vercelHeaders) res.setHeader(key, value);

  const url = new URL(req.url, BASE);

  try {
    if (url.pathname === '/sb' || url.pathname.startsWith('/sb/')) {
      let body = null;
      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
        const raw = await readBody(req, MAX_BODY_BYTES);
        try {
          body = JSON.parse(raw.toString('utf8') || 'null');
        } catch (err) {
          body = null;
        }
      }
      return await fake.handle(req, res, url.searchParams, body);
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    return await handleStatic(req, res, url);
  } catch (err) {
    if (err && err.tooLarge) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: false, reason: 'That request is too large.' }));
    }
    console.error('[harness] request failed:', err && err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, reason: 'Harness error.' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`harness listening on ${BASE} (dist: ${DIST})`);
});
