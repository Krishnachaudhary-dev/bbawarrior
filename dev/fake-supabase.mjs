import { createHash } from 'node:crypto';

/**
 * A small in-memory fake of the PostgREST surface the API actually uses, so the
 * real supabase-js client and the real serverless functions can be exercised
 * locally without touching a live database.
 *
 * Supported, faithfully enough for these endpoints:
 *   GET    with select=col|*, eq./neq. filters, maybeSingle (object accept),
 *          count=exact (content-range header)
 *   POST   insert, and upsert via Prefer: resolution=merge-duplicates
 *   PATCH  update with filters
 *   DELETE with filters
 *   Prefer: return=representation vs minimal
 *
 * Test-only backdoors live under /_test/ and are reachable only because the
 * harness mounts this handler there; nothing in api/ knows it exists.
 *
 * GET /_test/dump returns raw rows, which is how the tests assert that only
 * password hashes are ever written and that sessions are really deleted.
 */

export function tokenHashOf(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function createFakeSupabase({ secretKey }) {
  const tables = {
    class_state: [],
    class_sessions: [],
  };
  let mode = 'ok';

  function reset() {
    tables.class_state = [];
    tables.class_sessions = [];
  }

  function parseFilters(searchParams) {
    const filters = [];
    for (const [key, value] of searchParams) {
      if (['select', 'on_conflict', 'limit', 'order', 'offset'].includes(key)) continue;
      const match = value.match(/^(eq|neq)\.([\s\S]*)$/);
      if (match) filters.push({ column: key, op: match[1], value: match[2] });
    }
    return filters;
  }

  function matches(row, filters) {
    return filters.every((f) => {
      const cell = row[f.column] === undefined || row[f.column] === null ? null : String(row[f.column]);
      return f.op === 'eq' ? cell === f.value : f.op === 'neq' ? cell !== f.value : false;
    });
  }

  function project(rows, searchParams) {
    const select = String(searchParams.get('select') || '*');
    if (select === '*') return rows;
    const columns = select.split(',').map((c) => c.trim()).filter(Boolean);
    return rows.map((row) => {
      const out = {};
      for (const column of columns) out[column] = row[column];
      return out;
    });
  }

  function json(res, status, body, extraHeaders) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      ...(extraHeaders || {}),
    });
    res.end(payload);
  }

  function empty(res, status, extraHeaders) {
    res.writeHead(status, extraHeaders || {});
    res.end();
  }

  function bearerOf(header) {
    const value = String(header || '');
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
  }

  async function handle(req, res, searchParams, body) {
    const pathname = new URL(req.url, 'http://fake.local').pathname.replace(/^(\/sb)?\/rest\/v1/, '');
    const table = pathname.replace(/^\//, '').split('/')[0];

    /* ---- test backdoors (not part of the PostgREST surface) ---- */
    if (pathname === '/_test/wipe') {
      reset();
      return json(res, 200, { ok: true });
    }
    if (pathname === '/_test/mode') {
      mode = body && body.mode === 'fail' ? 'fail' : 'ok';
      return json(res, 200, { ok: true, mode });
    }
    if (pathname === '/_test/seed') {
      tables.class_state = [
        { id: 'section-h', data: body && body.state, updated_at: new Date().toISOString() },
      ];
      return json(res, 200, { ok: true });
    }
    if (pathname === '/_test/put-session') {
      tables.class_sessions.push(body && body.row);
      return json(res, 200, { ok: true });
    }
    if (pathname === '/_test/dump') {
      return json(res, 200, { ok: true, tables });
    }
    if (mode === 'fail') {
      return json(res, 500, { message: 'fake database failure' });
    }

    /* ---- PostgREST surface ---- */
    const apiKey = req.headers.apikey || bearerOf(req.headers.authorization);
    if (!apiKey || apiKey !== secretKey) {
      return json(res, 401, { message: 'Invalid API key', code: 'PGRST301' });
    }
    if (!(table in tables)) {
      return json(res, 404, { message: `relation "public.${table}" does not exist` });
    }

    const filters = parseFilters(searchParams);
    const prefer = String(req.headers.prefer || '');
    const accept = String(req.headers.accept || '');
    const wantsObject = accept.includes('vnd.pgrst.object+json');
    const wantsNullableObject = accept.includes('vnd.pgrst.object+json:null');
    const wantsCount = prefer.includes('count=exact');
    const wantsRepresentation = prefer.includes('return=representation');
    const isUpsert = prefer.includes('resolution=merge-duplicates');

    if (req.method === 'GET') {
      const rows = tables[table].filter((row) => matches(row, filters));
      if (wantsObject) {
        if (rows.length === 1) return json(res, 200, project(rows, searchParams)[0]);
        /* A zero row answer is "no such row", which every maybeSingle variant
           reads as data: null, whether or not the client asked for the :null
           flavour. Only a genuinely multi-row result is a 406. */
        if (rows.length === 0) return json(res, 200, null);
        return json(res, 406, {
          code: 'PGRST116',
          details: `The result contains ${rows.length} rows`,
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned',
        });
      }
      const headers = {};
      if (wantsCount) {
        headers['content-range'] = rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0';
      }
      return json(res, 200, project(rows, searchParams), headers);
    }

    if (req.method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body];
      for (const row of incoming) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          return json(res, 400, { message: 'Insert body must be an object' });
        }
        const pk = 'id';
        const index = isUpsert && row[pk] !== undefined
          ? tables[table].findIndex((existing) => String(existing[pk]) === String(row[pk]))
          : -1;
        if (index >= 0) tables[table][index] = { ...tables[table][index], ...row };
        else tables[table].push({ ...row });
      }
      if (wantsRepresentation) return json(res, 201, incoming);
      return empty(res, 201);
    }

    if (req.method === 'PATCH') {
      const updated = [];
      tables[table] = tables[table].map((row) => {
        if (!matches(row, filters)) return row;
        const next = { ...row, ...(body && typeof body === 'object' ? body : {}) };
        updated.push(next);
        return next;
      });
      if (wantsRepresentation) return json(res, 200, updated);
      return empty(res, 204);
    }

    if (req.method === 'DELETE') {
      const kept = [];
      const removed = [];
      for (const row of tables[table]) (matches(row, filters) ? removed : kept).push(row);
      tables[table] = kept;
      if (wantsRepresentation) return json(res, 200, removed);
      return empty(res, 204);
    }

    return json(res, 405, { message: 'Method not allowed' });
  }

  return { handle, reset, tables };
}
