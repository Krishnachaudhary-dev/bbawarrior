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
 *
 * The Storage surface the app actually uses is faked too: multipart upload to
 * the assignments bucket, public GET of an object, and the ?download=
 * disposition, so the real supabase-js upload()/getPublicUrl() path runs
 * locally end to end.
 */

export function tokenHashOf(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function createFakeSupabase({ secretKey }) {
  const tables = {
    class_state: [],
    class_sessions: [],
  };
  /* Storage objects: key "bucket/path" -> { bytes, contentType }. */
  const objects = new Map();
  let mode = 'ok';

  function reset() {
    tables.class_state = [];
    tables.class_sessions = [];
    objects.clear();
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

  /* ---- Storage surface -------------------------------------------------
     Mirrors supabase/storage's POST /object (multipart) and GET
     /object/public, with the same bucket name, MIME allow-list and size cap
     that supabase/schema.sql configures, so a client that would fail in
     production fails here too. */
  const STORAGE_BUCKET = 'assignments';
  const STORAGE_MIME = new Set([
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'image/avif', 'image/bmp', 'image/svg+xml',
  ]);
  const STORAGE_MAX_BYTES = 10 * 1024 * 1024;

  function storageError(res, status, message, error) {
    return json(res, status, { message, error, statusCode: status });
  }

  function parseMultipart(buffer, contentType) {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
    if (!match) return null;
    const boundary = Buffer.from('--' + (match[1] || match[2]).trim());
    const fields = {};
    let file = null;
    let cursor = buffer.indexOf(boundary);
    while (cursor !== -1) {
      const start = cursor + boundary.length;
      const next = buffer.indexOf(boundary, start);
      if (next === -1) break;
      const part = buffer.slice(start, next);
      cursor = next;
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const headers = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4, part.length - 2);
      const disposition = /content-disposition:\s*([^\r\n]+)/i.exec(headers);
      if (!disposition) continue;
      const filenameMatch = /filename="([^"]*)"/.exec(disposition[1]);
      const nameMatch = /name="([^"]*)"/.exec(disposition[1]);
      if (filenameMatch || (nameMatch && nameMatch[1] === '')) {
        const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
        file = {
          bytes: content,
          contentType: ctMatch ? ctMatch[1].trim() : '',
          filename: filenameMatch ? filenameMatch[1] : '',
        };
      } else if (nameMatch) {
        fields[nameMatch[1]] = content.toString('utf8');
      }
    }
    if (!file) return null;
    return { fields, file };
  }

  async function storageHandle(req, res, searchParams, raw, rawPath) {
    const segments = rawPath.replace(/^(?:\/sb)?\/storage\/v1\/object\//, '').split('/');
    const qualifier = ['public', 'sign', 'authenticated'].includes(segments[0]) ? segments.shift() : '';
    const bucket = decodeURIComponent(segments[0] || '');
    const objectPath = segments.slice(1).map(decodeURIComponent).join('/');

    if (req.method === 'POST' || req.method === 'PUT') {
      const apiKey = req.headers.apikey || bearerOf(req.headers.authorization);
      const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || '';
      if (!apiKey || (apiKey !== secretKey && apiKey !== publishable)) {
        return storageError(res, 401, 'Invalid API key', 'invalid_api_key');
      }
      if (bucket !== STORAGE_BUCKET) return storageError(res, 404, `Bucket ${bucket} not found`, 'not_found');
      /* Two upload shapes, same as real Storage: a Blob rides multipart/form-data
         (the browser's pick), a Buffer rides as a raw body with its own
         content-type header (the server side migration). */
      const requestType = String(req.headers['content-type'] || '');
      let fileBytes = null;
      let contentType = '';
      if (requestType.toLowerCase().includes('multipart/form-data')) {
        const parsed = raw ? parseMultipart(raw, requestType) : null;
        if (!parsed) return storageError(res, 400, 'Could not parse the multipart body', 'invalid_request');
        fileBytes = parsed.file.bytes;
        contentType = parsed.file.contentType || parsed.fields.contentType || '';
      } else {
        fileBytes = raw || Buffer.alloc(0);
        contentType = requestType;
      }
      contentType = String(contentType || 'application/octet-stream').toLowerCase();
      if (!STORAGE_MIME.has(contentType)) return storageError(res, 400, `MIME type ${contentType} is not allowed`, 'invalid_mime_type');
      if (fileBytes.length > STORAGE_MAX_BYTES) return storageError(res, 413, 'Payload too large', 'too_large');
      objects.set(`${bucket}/${objectPath}`, { bytes: Buffer.from(fileBytes), contentType });
      return json(res, 200, { Id: `${bucket}/${objectPath}`, Key: `${bucket}/${objectPath}` });
    }

    if (req.method === 'GET') {
      const stored = objects.get(`${bucket}/${objectPath}`);
      if (!stored) return storageError(res, 404, 'Object not found', 'not_found');
      const headers = {
        'content-type': stored.contentType || 'application/octet-stream',
        'content-length': String(stored.bytes.length),
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=3600',
      };
      if (searchParams.has('download')) {
        const asked = searchParams.get('download');
        const name = String(asked || objectPath.split('/').pop() || 'file').replace(/[^\w.-]+/g, '_');
        headers['content-disposition'] = `attachment; filename="${name}"`;
      }
      res.writeHead(200, headers);
      return res.end(stored.bytes);
    }

    return storageError(res, 405, 'Method not allowed', 'method_not_allowed');
  }

  async function handle(req, res, searchParams, body, raw) {
    const rawPath = new URL(req.url, 'http://fake.local').pathname;
    /* Storage traffic never enters the PostgREST surface below. */
    if (rawPath.includes('/storage/v1/')) return storageHandle(req, res, searchParams, raw, rawPath);
    const pathname = rawPath.replace(/^(\/sb)?\/rest\/v1/, '');
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
      const storage = [...objects.entries()].map(([key, value]) => ({
        key,
        contentType: value.contentType,
        size: value.bytes.length,
      }));
      return json(res, 200, { ok: true, tables, storage });
    }
    if (pathname === '/_test/append-item') {
      /* Adds one card to whatever board exists without touching accounts, so
         a test can seed an inline-file row and still keep its sessions. */
      const row = tables.class_state[0] || { id: 'section-h' };
      const doc = row.data && typeof row.data === 'object' ? row.data : {};
      const items = Array.isArray(doc.items) ? doc.items : [];
      tables.class_state[0] = {
        ...row,
        data: { ...doc, items: [...items, (body && body.item) || {}] },
        updated_at: new Date().toISOString(),
      };
      return json(res, 200, { ok: true });
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
