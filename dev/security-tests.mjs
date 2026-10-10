import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenHashOf } from './fake-supabase.mjs';

/**
 * Attacker-style tests for the overhauled API. Starts dev/test-server.mjs,
 * walks the security checklist, prints one line per check.
 *
 *   HARNESS_NODE=<node> node dev/security-tests.mjs
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT || 8791);
const BASE = `http://127.0.0.1:${PORT}`;
const NODE = process.env.HARNESS_NODE || 'node';
const SECRET =
  process.env.TEST_SECRET_KEY || 'fake_secret_test-harness-0123456789abcdef0123456789abcdef';

/* ---------- tiny HTTP client ---------- */

function httpRaw(method, pathName, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE}${pathName}`,
      { method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (err) {
            /* not every answer is JSON, and that is itself a check */
          }
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      },
    );
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

const JSON_HEADERS = { 'content-type': 'application/json' };

async function jsonPost(pathName, body, { cookie: asCookie = '' } = {}) {
  return httpRaw('POST', pathName, {
    headers: { ...JSON_HEADERS, origin: BASE, ...(asCookie ? { cookie: asCookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function dumpTables() {
  const res = await httpRaw('GET', '/sb/rest/v1/_test/dump', {});
  return res.json.tables;
}

/* ---------- state ---------- */

const results = [];
let failures = 0;
let adminCookie = '';
let studentCookie = '';

function record(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) {
    failures++;
    console.log(`FAIL  ${name}  ${detail || ''}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

async function check(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (err) {
    record(name, false, err && err.message ? err.message : String(err));
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

async function loginAs(username, password) {
  const res = await jsonPost('/api/auth/login', { username, password });
  const setCookie = res.headers['set-cookie'] && res.headers['set-cookie'][0];
  const token = setCookie ? (setCookie.match(/bba_session=([^;]+)/) || [])[1] : null;
  return { res, token };
}

const ADMIN = { username: 'Admin One', password: 'correct horse battery staple' };
const STUDENT = { username: 'Betty Student', password: 'student-pass-1234' };
const STUDENT_NEXT = 'brand-new-pass-77';

/* ---------- server lifecycle ---------- */

let server = null;
let serverOutput = '';

async function startServer() {
  server = spawn(NODE, ['dev/test-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, TEST_PORT: String(PORT), TEST_SECRET_KEY: SECRET, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => (serverOutput += String(d)));
  server.stderr.on('data', (d) => (serverOutput += String(d)));
  for (let i = 0; i < 60; i++) {
    try {
      const res = await httpRaw('GET', '/api/health', {});
      if (res.status < 500) return;
    } catch (err) {
      /* not accepting connections yet */
    }
    await sleep(200);
  }
  throw new Error(`harness did not start. output:\n${serverOutput.slice(-2000)}`);
}

function stopServer() {
  if (server) {
    server.kill();
    server = null;
  }
}

/* ---------- the checklist ---------- */

const tests = [
  () =>
    check('01 static page served with the production security headers', async () => {
      const res = await httpRaw('GET', '/', {});
      expect(res.status === 200, `status ${res.status}`);
      const csp = String(res.headers['content-security-policy'] || '');
      expect(csp.includes("script-src 'self'"), `CSP script-src wrong: ${csp}`);
      expect(csp.includes("default-src 'none'"), `CSP default-src wrong: ${csp}`);
      expect(!csp.includes("'unsafe-eval'"), 'CSP allows unsafe-eval');
      expect(
        res.headers['strict-transport-security'] === 'max-age=31536000; includeSubDomains',
        'HSTS wrong',
      );
      expect(res.headers['x-content-type-options'] === 'nosniff', 'nosniff missing');
      expect(res.headers['x-frame-options'] === 'DENY', 'X-Frame-Options not DENY');
      expect(
        String(res.headers['referrer-policy']).includes('strict-origin-when-cross-origin'),
        'referrer policy missing',
      );
      expect(String(res.headers['permissions-policy']).includes('camera=()'), 'permissions policy missing');
    }),

  () =>
    check('02 browser bundle: no credentials, no CDN scripts, no sensitive storage', async () => {
      const page = await httpRaw('GET', '/', {});
      expect(page.status === 200, `index status ${page.status}`);
      const raw = page.raw;
      expect(!/DEFAULT_PASSWORD/.test(raw), 'index mentions DEFAULT_PASSWORD');
      expect(!/ADMIN_HASH/.test(raw), 'index mentions ADMIN_HASH');
      expect(!/sb_secret_/.test(raw), 'index mentions a secret key');
      expect(!/service_role/i.test(raw), 'index mentions service_role');
      for (const needle of ['unpkg.com', 'cdn.tailwindcss.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net', 'esm.sh']) {
        expect(!raw.includes(needle), `index still loads a CDN: ${needle}`);
      }
      const scripts = [...raw.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
      expect(scripts.length <= 2 && scripts.every((s) => s.startsWith('/assets/')), `unexpected scripts: ${scripts.join(',')}`);
      for (const src of scripts) {
        const bundle = await httpRaw('GET', src, {});
        expect(bundle.status === 200, `bundle status ${bundle.status}`);
        const js = bundle.raw;
        expect(!/DEFAULT_PASSWORD/.test(js), 'bundle mentions DEFAULT_PASSWORD');
        expect(!/ADMIN_HASH/.test(js), 'bundle mentions ADMIN_HASH');
        expect(!/sb_secret_/.test(js), 'bundle contains a secret key');
        expect(!/service_role/i.test(js), 'bundle mentions service_role');
        expect(!/"password"\s*:\s*"[^"]+"/.test(js), 'bundle contains a password literal');
        expect(!/sessionStorage/.test(js), 'bundle uses sessionStorage');
        expect(!/document\.cookie/.test(js), 'bundle touches document.cookie');
        expect(
          !/localStorage\.(get|set|remove)Item\(\s*["'`][^"'`]*(pass|token|secret|hash)/i.test(js),
          'bundle stores a sensitive key in localStorage',
        );
        expect(!/[\u2013\u2014]/.test(js), 'bundle contains an em/en dash');
      }
    }),

  () =>
    check('03 first-run setup creates the admin once, then is dead', async () => {
      const before = await dumpTables();
      expect(before.class_state.length === 0, 'board is not empty at start');
      const first = await jsonPost('/api/auth/setup', ADMIN);
      expect(first.status === 200 && first.json.ok === true, `setup failed: ${first.status} ${first.raw}`);
      expect(first.json.account && first.json.account.role === 'admin', 'first account should be admin');
      expect(!('password' in first.json.account), 'setup response leaks a password field');
      const again = await jsonPost('/api/auth/setup', { username: 'Second Try', password: 'another-pass-99' });
      expect(again.status === 403, `second setup must 403, got ${again.status}`);
      const admin = await loginAs(ADMIN.username, ADMIN.password);
      expect(admin.res.status === 200, `admin login failed: ${admin.res.status} ${admin.res.raw}`);
      adminCookie = `bba_session=${admin.token}`;
      const created = await jsonPost(
        '/api/admin/accounts',
        { username: STUDENT.username, password: STUDENT.password, role: 'student' },
        { cookie: adminCookie },
      );
      expect(created.status === 200, `create student failed: ${created.status} ${created.raw}`);
      const betty = (created.json.accounts || []).find((a) => a.username === STUDENT.username);
      expect(betty && betty.role === 'student', 'created student missing from response');
      expect(betty && !('password' in betty), 'account list leaks a password field');
    }),

  () =>
    check('04 student gets 403 on every admin path; role and id tricks change nothing', async () => {
      const student = await loginAs(STUDENT.username, STUDENT.password);
      expect(student.res.status === 200, `student login failed: ${student.res.status}`);
      studentCookie = `bba_session=${student.token}`;
      const create = await jsonPost('/api/admin/accounts', STUDENT, { cookie: studentCookie });
      expect(create.status === 403, `student create account: ${create.status}`);
      const patch = await httpRaw('PATCH', '/api/admin/accounts/some-id', {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: studentCookie },
        body: JSON.stringify({ role: 'admin' }),
      });
      expect(patch.status === 403, `student patch role: ${patch.status}`);
      const reset = await jsonPost(
        '/api/admin/accounts/some-id/reset-password',
        { newPassword: 'nope-nope-nope' },
        { cookie: studentCookie },
      );
      expect(reset.status === 403, `student reset password: ${reset.status}`);
      const board = await jsonPost('/api/action', { type: 'saveBoard', payload: [] }, { cookie: studentCookie });
      expect(board.status === 403, `student saveBoard: ${board.status}`);
      const config = await jsonPost(
        '/api/action',
        { type: 'saveConfig', payload: { classCode: 'HACKED', subjects: [] } },
        { cookie: studentCookie },
      );
      expect(config.status === 403, `student saveConfig: ${config.status}`);
    }),

  () =>
    check('05 unauthenticated callers are 401 everywhere', async () => {
      const board = await jsonPost('/api/action', { type: 'saveBoard', payload: [] });
      expect(board.status === 401, `saveBoard without session: ${board.status}`);
      const create = await jsonPost('/api/admin/accounts', STUDENT);
      expect(create.status === 401, `admin create without session: ${create.status}`);
      const me = await httpRaw('GET', '/api/auth/me', {});
      expect(me.status === 401, `me without session: ${me.status}`);
      const forged = await httpRaw('GET', '/api/auth/me', {
        headers: { cookie: 'bba_session=forged-token-value-000000' },
      });
      expect(forged.status === 401, `forged token: ${forged.status}`);
    }),

  () =>
    check('06 /api/state is least privilege: public accounts, no secrets', async () => {
      const res = await httpRaw('GET', '/api/state', {});
      expect(res.status === 200, `status ${res.status}`);
      const body = res.json;
      for (const key of Object.keys(body)) {
        expect(
          ['ok', 'items', 'config', 'accounts', 'attendance', 'syncedAt', 'realtime'].includes(key),
          `unexpected state field "${key}"`,
        );
      }
      for (const account of body.accounts) {
        expect(
          JSON.stringify(Object.keys(account).sort()) ===
            JSON.stringify(['createdAt', 'id', 'lastSeen', 'role', 'username']),
          `account keys not whitelisted: ${Object.keys(account).join(',')}`,
        );
      }
      expect(body.config && typeof body.config.classCode === 'string', 'config missing classCode');
      const realtime = body.realtime;
      if (realtime) {
        expect(Object.keys(realtime).sort().join(',') === 'anonKey,url', `realtime leaks fields: ${Object.keys(realtime).join(',')}`);
        /* The real deployment uses sb_publishable_...; the local harness uses
           fake_publishable_... so no key-shaped string is ever committed. */
        expect(
          /^(sb_publishable_|fake_publishable_)/.test(String(realtime.anonKey)),
          'realtime key is not a publishable-style key',
        );
      }
    }),

  () =>
    check('07 storage: password hashes only, server ids, sha256 session rows', async () => {
      const tables = await dumpTables();
      const row = tables.class_state[0];
      expect(row && row.data && Array.isArray(row.data.accounts), 'no accounts in database');
      for (const account of row.data.accounts) {
        expect(
          !Object.prototype.hasOwnProperty.call(account, 'password') ||
            String(account.password).startsWith('scrypt$'),
          `account ${account.username} holds a plaintext password in storage`,
        );
        expect(
          typeof account.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(account.id),
          'account id not server-shaped',
        );
      }
      for (const session of tables.class_sessions || []) {
        expect(/^[a-f0-9]{64}$/.test(session.token_hash), 'a session token is stored unhashed');
        expect(!('token' in session), 'session row keeps a raw token field');
      }
    }),

  () =>
    check('08 auth failures are uniform: unknown user equals wrong password', async () => {
      const unknown = await jsonPost('/api/auth/login', { username: 'Nobody Here', password: 'wrong-password-1' });
      expect(unknown.status === 401, `unknown user: ${unknown.status}`);
      const known = await jsonPost('/api/auth/login', { username: ADMIN.username, password: 'wrong-password-2' });
      expect(known.status === 401, `known user wrong password: ${known.status}`);
      expect(unknown.json.reason === known.json.reason, 'responses differ between unknown and wrong password');
    }),

  () =>
    check('09 admin lifecycle: rename, role flip, reset, delete, last-admin guard', async () => {
      const created = await jsonPost(
        '/api/admin/accounts',
        { username: 'Carl Second', password: 'carl-pass-8888', role: 'student' },
        { cookie: adminCookie },
      );
      expect(created.status === 200, `create carl: ${created.status} ${created.raw}`);
      const state = await httpRaw('GET', '/api/state', {});
      const carl = state.json.accounts.find((a) => a.username === 'Carl Second');
      expect(carl, 'carl missing from state');
      const id = carl.id;

      const rename = await httpRaw('PATCH', `/api/admin/accounts/${id}`, {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: adminCookie },
        body: JSON.stringify({ username: 'Carl Renamed' }),
      });
      expect(rename.status === 200, `rename: ${rename.status} ${rename.raw}`);
      const promote = await httpRaw('PATCH', `/api/admin/accounts/${id}`, {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: adminCookie },
        body: JSON.stringify({ role: 'admin' }),
      });
      expect(promote.status === 200, `promote: ${promote.status}`);
      const demote = await httpRaw('PATCH', `/api/admin/accounts/${id}`, {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: adminCookie },
        body: JSON.stringify({ role: 'student' }),
      });
      expect(demote.status === 200, `demote: ${demote.status}`);

      const reset = await jsonPost(
        `/api/admin/accounts/${id}/reset-password`,
        { newPassword: 'carl-new-9999' },
        { cookie: adminCookie },
      );
      expect(reset.status === 200, `reset: ${reset.status} ${reset.raw}`);
      const oldLogin = await loginAs('Carl Renamed', 'carl-pass-8888');
      expect(oldLogin.res.status === 401, 'old password still works after admin reset');
      const newLogin = await loginAs('Carl Renamed', 'carl-new-9999');
      expect(newLogin.res.status === 200, 'new password does not work');

      const remove = await httpRaw('DELETE', `/api/admin/accounts/${id}`, {
        headers: { origin: BASE, cookie: adminCookie },
      });
      expect(remove.status === 200, `delete carl: ${remove.status} ${remove.raw}`);
      const afterDelete = await httpRaw('GET', '/api/auth/me', {
        headers: { cookie: `bba_session=${newLogin.token}` },
      });
      expect(afterDelete.status === 401, 'deleted account session still alive');

      const missing = await httpRaw('DELETE', '/api/admin/accounts/does-not-exist-xyz', {
        headers: { origin: BASE, cookie: adminCookie },
      });
      expect(missing.status === 404, `delete missing: ${missing.status}`);

      const adminState = await httpRaw('GET', '/api/state', {});
      const adminId = adminState.json.accounts.find((a) => a.role === 'admin').id;
      const demoteSelf = await httpRaw('PATCH', `/api/admin/accounts/${adminId}`, {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: adminCookie },
        body: JSON.stringify({ role: 'student' }),
      });
      expect(demoteSelf.status === 403, `last admin demote: ${demoteSelf.status}`);
      const deleteSelf = await httpRaw('DELETE', `/api/admin/accounts/${adminId}`, {
        headers: { origin: BASE, cookie: adminCookie },
      });
      expect(deleteSelf.status === 403, `last admin delete: ${deleteSelf.status}`);
    }),

  () =>
    check('10 malformed and hostile requests are rejected with correct statuses', async () => {
      const badJson = await httpRaw('POST', '/api/action', {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: studentCookie },
        body: 'this is not json',
      });
      expect(badJson.status === 400, `invalid JSON: ${badJson.status}`);
      const sneaky = await jsonPost('/api/action', { type: 'saveBoard', payload: [], sneaky: true }, { cookie: studentCookie });
      expect(sneaky.status === 400, `unknown top-level field: ${sneaky.status}`);
      const badType = await jsonPost('/api/action', { type: 'deleteEverything', payload: {} }, { cookie: studentCookie });
      expect(badType.status === 400, `unknown action: ${badType.status}`);
      const badItem = await jsonPost(
        '/api/action',
        {
          type: 'saveBoard',
          payload: [
            {
              id: 'x1', title: 'T', subject: 'S', status: 'pending', dueDate: '',
              ownerId: '', ownerName: '', images: [], solutionImages: [], createdAt: 1, evil: 'field',
            },
          ],
        },
        { cookie: adminCookie },
      );
      expect(badItem.status === 400, `unknown item field: ${badItem.status}`);
      const badRole = await jsonPost(
        '/api/admin/accounts',
        { username: 'R', password: 'long-enough-123', role: 'superadmin' },
        { cookie: adminCookie },
      );
      expect(badRole.status === 400, `invalid role: ${badRole.status}`);
      const oversize = await httpRaw('POST', '/api/action', {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: adminCookie },
        body: JSON.stringify({ type: 'saveBoard', payload: [] }) + ' '.repeat(5 * 1024 * 1024),
      });
      expect(oversize.status === 413, `oversize body: ${oversize.status}`);
      const getOnPost = await httpRaw('GET', '/api/auth/login', {});
      expect(getOnPost.status === 405, `GET on login: ${getOnPost.status}`);
      const unknownRoute = await httpRaw('GET', '/api/no-such-route', {});
      expect(unknownRoute.status === 404, `unknown route: ${unknownRoute.status}`);
    }),

  () =>
    check('11 CSRF: cross-origin and Origin:null writes refused, same-origin allowed', async () => {
      const evil = await httpRaw('POST', '/api/action', {
        headers: { ...JSON_HEADERS, origin: 'https://evil.example', cookie: studentCookie },
        body: JSON.stringify({ type: 'attendance', payload: { name: 'Betty Student', mode: 'quiz', at: Date.now() } }),
      });
      expect(evil.status === 403, `cross-origin write: ${evil.status}`);
      const nullOrigin = await httpRaw('POST', '/api/action', {
        headers: { ...JSON_HEADERS, origin: 'null', cookie: studentCookie },
        body: JSON.stringify({ type: 'attendance', payload: { name: 'Betty Student', mode: 'quiz', at: Date.now() } }),
      });
      expect(nullOrigin.status === 403, `Origin: null write: ${nullOrigin.status}`);
      const good = await jsonPost(
        '/api/action',
        { type: 'attendance', payload: { name: 'Betty Student', mode: 'quiz', at: Date.now() } },
        { cookie: studentCookie },
      );
      expect(good.status === 200, `same-origin attendance: ${good.status}`);
    }),

  () =>
    check('12 login is rate limited with 429 and Retry-After', async () => {
      let limited = null;
      for (let i = 0; i < 15; i++) {
        const res = await jsonPost('/api/auth/login', { username: 'rate-test-user', password: 'whatever-strings' });
        if (res.status === 429) {
          limited = res;
          break;
        }
      }
      expect(limited, 'no 429 after 15 bad logins');
      expect(Number(limited.headers['retry-after']) >= 1, 'no Retry-After on 429');
      expect(limited.json.rateLimited === true, '429 body missing rateLimited flag');
    }),

  () =>
    check('13 registration is rate limited and the class code is required', async () => {
      let limited = null;
      for (let i = 0; i < 8; i++) {
        const res = await jsonPost('/api/auth/register', {
          username: `Joiner ${i}`,
          password: 'join-pass-1234',
          code: 'wrong-code',
        });
        if (res.status === 429) {
          limited = res;
          break;
        }
        expect(res.status === 403, `register attempt ${i}: ${res.status}`);
      }
      expect(limited, 'no 429 after repeated registrations');
    }),

  () =>
    check('14 expired sessions are refused and purged', async () => {
      const { token } = await loginAs(STUDENT.username, STUDENT.password);
      expect(!!token, 'student login failed');
      const hash = tokenHashOf(token);
      const expire = await httpRaw(
        'PATCH',
        `/sb/rest/v1/class_sessions?token_hash=eq.${hash}`,
        { headers: { ...JSON_HEADERS, apikey: SECRET }, body: JSON.stringify({ expires_at: '2020-01-01T00:00:00.000Z' }) },
      );
      expect(expire.status === 204, `fake expiry update: ${expire.status}`);
      const me = await httpRaw('GET', '/api/auth/me', { headers: { cookie: `bba_session=${token}` } });
      expect(me.status === 401, `expired session accepted: ${me.status}`);
      const tables = await dumpTables();
      expect(
        !tables.class_sessions.some((s) => s.token_hash === hash),
        'expired session row was not deleted',
      );
    }),

  () =>
    check('15 password change: auth required, current verified, other sessions die', async () => {
      const noAuth = await jsonPost('/api/auth/change-password', { currentPassword: 'x', newPassword: 'new-pass-9999' });
      expect(noAuth.status === 401, `change without session: ${noAuth.status}`);
      const a = await loginAs(STUDENT.username, STUDENT.password);
      const b = await loginAs(STUDENT.username, STUDENT.password);
      expect(a.token && b.token, 'student logins failed');
      const wrong = await jsonPost(
        '/api/auth/change-password',
        { currentPassword: 'not-it-9999', newPassword: STUDENT_NEXT },
        { cookie: `bba_session=${a.token}` },
      );
      expect(wrong.status === 403, `wrong current password: ${wrong.status}`);
      const short = await jsonPost(
        '/api/auth/change-password',
        { currentPassword: STUDENT.password, newPassword: 'short' },
        { cookie: `bba_session=${a.token}` },
      );
      expect(short.status === 400, `weak new password: ${short.status}`);
      const ok = await jsonPost(
        '/api/auth/change-password',
        { currentPassword: STUDENT.password, newPassword: STUDENT_NEXT },
        { cookie: `bba_session=${a.token}` },
      );
      expect(ok.status === 200, `change failed: ${ok.status} ${ok.raw}`);
      const revoked = await httpRaw('GET', '/api/auth/me', { headers: { cookie: `bba_session=${b.token}` } });
      expect(revoked.status === 401, 'other session survived the password change');
      const relogin = await loginAs(STUDENT.username, STUDENT_NEXT);
      expect(relogin.res.status === 200, 'new password does not work');
      studentCookie = `bba_session=${relogin.token}`;
    }),

  () =>
    check('16 session cookie is HttpOnly, SameSite=Lax, Path=/', async () => {
      const { res, token } = await loginAs(STUDENT.username, STUDENT_NEXT);
      expect(!!token, 'no cookie issued');
      const setCookie = res.headers['set-cookie'][0];
      expect(setCookie.includes('HttpOnly'), 'HttpOnly missing');
      expect(setCookie.includes('SameSite=Lax'), 'SameSite=Lax missing');
      expect(setCookie.includes('Path=/'), 'Path=/ missing');
      expect(/^bba_session=[A-Za-z0-9_-]{20,128};/.test(setCookie), `token shape odd: ${setCookie.slice(0, 40)}`);
    }),

  () =>
    check('17 prototype pollution payloads are rejected or inert', async () => {
      const protoTop = await httpRaw('POST', '/api/action', {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: studentCookie },
        body: '{"type":"saveBoard","payload":[],"__proto__":{"evil":true}}',
      });
      expect(protoTop.status === 400, `top-level __proto__: ${protoTop.status}`);
      const protoNested = await httpRaw('POST', '/api/action', {
        headers: { ...JSON_HEADERS, origin: BASE, cookie: studentCookie },
        body: '{"type":"attendance","payload":{"name":"Betty","mode":"quiz","at":1,"__proto__":{"evil":true}}}',
      });
      expect(protoNested.status === 400, `nested __proto__: ${protoNested.status}`);
      const state = await httpRaw('GET', '/api/state', {});
      expect(state.status === 200, 'state broke after proto attempts');
      expect(!String(state.raw).includes('evil'), 'state carries the probe');
    }),

  () =>
    check('18 the app still works: admin save, student attendance, state reflects both', async () => {
      const item = {
        id: 'seed-verify-1',
        subject: 'Business Economics',
        title: 'Verification card',
        description: 'Written by the security harness.',
        solution: '',
        dueDate: '2026-10-20',
        status: 'pending',
        ownerId: '',
        ownerName: '',
        images: [],
        solutionImages: [],
        createdAt: Date.now(),
      };
      const save = await jsonPost('/api/action', { type: 'saveBoard', payload: [item] }, { cookie: adminCookie });
      expect(save.status === 200, `admin saveBoard: ${save.status} ${save.raw}`);
      const config = await jsonPost(
        '/api/action',
        { type: 'saveConfig', payload: { classCode: 'SECTION-H', subjects: ['Business Economics'], theme: 'dark' } },
        { cookie: adminCookie },
      );
      expect(config.status === 200, `admin saveConfig: ${config.status}`);
      const attendance = await jsonPost(
        '/api/action',
        { type: 'attendance', payload: { name: 'Betty Student', mode: 'quiz', at: Date.now() } },
        { cookie: studentCookie },
      );
      expect(attendance.status === 200, `student attendance: ${attendance.status}`);
      const state = await httpRaw('GET', '/api/state', {});
      expect(state.json.items.some((i) => i.id === 'seed-verify-1'), 'board item missing after save');
      expect(state.json.config.classCode === 'SECTION-H', 'config not saved');
      expect(state.json.attendance.some((e) => e.name === 'Betty Student'), 'attendance not recorded');
    }),

  () =>
    check('19 files live in Storage: inline base64 moved out, links are the only currency', async () => {
      /* An old row still holding a data: URL, seeded directly so the accounts
         stay intact - exactly what a legacy board looks like on arrival. */
      const inlinePng =
        'data:image/png;base64,' +
        Buffer.from('\x89PNG\r\n\x1a\nfake-png-bytes-for-the-migration-test').toString('base64');
      const seeded = await httpRaw('POST', '/sb/rest/v1/_test/append-item', {
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({
          item: {
            id: 'legacy-inline-1',
            subject: 'Business Economics',
            title: 'Legacy card',
            description: 'Carries an inline picture.',
            solution: '',
            dueDate: '',
            status: 'pending',
            ownerId: '',
            ownerName: '',
            images: [inlinePng],
            solutionImages: [],
            createdAt: Date.now(),
          },
        }),
      });
      expect(seeded.status === 200, `seed: ${seeded.status}`);

      /* A read must never return the payload: instant load is the contract. */
      const state = await httpRaw('GET', '/api/state', {});
      expect(state.status === 200, `state: ${state.status}`);
      expect(!state.raw.includes('data:image'), 'a read still carries inline base64');
      const migratedItem = state.json.items.find((i) => i.id === 'legacy-inline-1');
      expect(!!migratedItem, 'legacy card missing after read');
      expect(
        Array.isArray(migratedItem.images) &&
          migratedItem.images.length === 1 &&
          migratedItem.images[0].startsWith(`${BASE}/sb/storage/v1/object/public/assignments/`),
        `image was not moved to Storage: ${JSON.stringify(migratedItem.images)}`,
      );

      /* The row itself was rewritten: the database holds a link, not bytes. */
      const dump = await httpRaw('GET', '/sb/rest/v1/_test/dump', {});
      const storedItem = dump.json.tables.class_state[0].data.items.find((i) => i.id === 'legacy-inline-1');
      expect(
        storedItem.images[0].startsWith('http') && !storedItem.images[0].startsWith('data:'),
        'the database row still holds base64',
      );
      expect(
        dump.json.storage.some((o) => o.key.startsWith('assignments/') && o.contentType === 'image/png'),
        'the moved file never landed in the fake bucket',
      );

      /* saveBoard accepts a Storage link, refuses inline base64 and refuses
         any other origin. */
      const base = {
        id: 'storage-accept-1',
        subject: 'Business Economics',
        title: 'Attachment card',
        description: 'Links only.',
        solution: '',
        dueDate: '',
        status: 'pending',
        ownerId: '',
        ownerName: '',
        images: [migratedItem.images[0]],
        solutionImages: [],
        createdAt: Date.now(),
      };
      const good = await jsonPost('/api/action', { type: 'saveBoard', payload: [base] }, { cookie: adminCookie });
      expect(good.status === 200, `storage link refused: ${good.status} ${good.raw}`);

      const inline = await jsonPost(
        '/api/action',
        { type: 'saveBoard', payload: [{ ...base, id: 'storage-inline-1', images: [inlinePng] }] },
        { cookie: adminCookie },
      );
      expect(inline.status === 400, `inline base64 accepted: ${inline.status}`);
      expect(
        String((inline.json && inline.json.reason) || '').toLowerCase().includes('base64'),
        `inline rejection reason unclear: ${inline.raw}`,
      );

      const foreign = await jsonPost(
        '/api/action',
        { type: 'saveBoard', payload: [{ ...base, id: 'storage-foreign-1', images: ['https://evil.example/x.png'] }] },
        { cookie: adminCookie },
      );
      expect(foreign.status === 400, `foreign URL accepted: ${foreign.status}`);
    }),

  () =>
    check('20 logout invalidates the session server side and is idempotent', async () => {
      const { token } = await loginAs(STUDENT.username, STUDENT_NEXT);
      expect(!!token, 'student login failed');
      const cookie = `bba_session=${token}`;
      const meBefore = await httpRaw('GET', '/api/auth/me', { headers: { cookie } });
      expect(meBefore.status === 200, 'me before logout failed');
      const out = await jsonPost('/api/auth/logout', {}, { cookie });
      expect(out.status === 200, `logout: ${out.status}`);
      const meAfter = await httpRaw('GET', '/api/auth/me', { headers: { cookie } });
      expect(meAfter.status === 401, 'session survived logout');
      const tables = await dumpTables();
      expect(
        !tables.class_sessions.some((s) => s.token_hash === tokenHashOf(token)),
        'logout left the session row',
      );
      const again = await jsonPost('/api/auth/logout', {}, { cookie });
      expect(again.status === 200, `second logout: ${again.status}`);
      const noCookie = await jsonPost('/api/auth/logout', {});
      expect(noCookie.status === 200, 'logout without a session should still be ok');
    }),

  () =>
    check('21 server errors are generic: no stack traces, no driver internals', async () => {
      await httpRaw('POST', '/sb/rest/v1/_test/mode', {
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({ mode: 'fail' }),
      });
      try {
        const state = await httpRaw('GET', '/api/state', {});
        expect(state.status === 500, `state during outage: ${state.status}`);
        expect(
          !/stack|at .+\.js:\d+|postgrest|fetch failed/i.test(state.raw),
          `error leaks internals: ${state.raw.slice(0, 200)}`,
        );
        const save = await jsonPost('/api/action', { type: 'saveBoard', payload: [] }, { cookie: adminCookie });
        expect(save.status === 503, `write during outage: ${save.status}`);
        expect(!/stack|postgrest|fetch failed/i.test(save.raw), 'write error leaks internals');
      } finally {
        await httpRaw('POST', '/sb/rest/v1/_test/mode', {
          headers: { ...JSON_HEADERS },
          body: JSON.stringify({ mode: 'ok' }),
        });
      }
      const recovered = await httpRaw('GET', '/api/state', {});
      expect(recovered.status === 200, 'state did not recover after outage');
    }),
];

/* ---------- run ---------- */

(async () => {
  await startServer();
  try {
    for (const test of tests) await test();
  } finally {
    stopServer();
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed, ${failures} failed.`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('runner crashed:', err);
  stopServer();
  process.exit(1);
});
