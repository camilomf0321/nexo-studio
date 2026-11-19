import { projects, services, statuses } from '../public/catalog.mjs';

const sessionPattern = /^[0-9a-f]{32}$/;
const sampleQueries = `
  SELECT s.id, s.service, s.project, COALESCE(r.status, s.status) AS status,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || s.days_ago || ' days') AS created_at
    FROM samples AS s
    LEFT JOIN requests AS r ON r.session_id = ? AND r.sample_id = s.id
  UNION ALL
  SELECT id, service, project, status, created_at
    FROM requests WHERE session_id = ? AND sample_id IS NULL
`;

function send(body, status = 200, cookie) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return Response.json(body, { status, headers });
}

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 1024) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  }
}

async function api(request, { DB }, url) {
  let session = request.headers.get('cookie')?.match(/(?:^|;\s*)nexo_session=([^;]+)/)?.[1];
  let cookie;
  if (!sessionPattern.test(session ?? '')) {
    session = crypto.randomUUID().replaceAll('-', '');
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    cookie = `nexo_session=${session}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
  }
  const reply = (body, status) => send(body, status, cookie);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/dashboard') {
    const period = url.searchParams.get('period') || '30';
    const service = url.searchParams.get('service') || 'all';
    const status = url.searchParams.get('status') || 'all';
    if (!['7', '30', '90'].includes(period) ||
        (service !== 'all' && !Object.hasOwn(services, service)) ||
        (status !== 'all' && !Object.hasOwn(statuses, status))) {
      return reply({ error: 'Revisa los filtros del tablero.' }, 400);
    }
    const filters = `WITH combined AS (${sampleQueries}), filtered AS (
      SELECT * FROM combined
       WHERE date(created_at, '-5 hours') >= date('now', '-5 hours', ?)
         AND (? = 'all' OR service = ?) AND (? = 'all' OR status = ?)
    )`;
    const params = [session, session, `-${Number(period) - 1} days`, service, service, status, status];
    const [rows, groups, trend] = await DB.batch([
      DB.prepare(`${filters} SELECT * FROM filtered ORDER BY created_at DESC, id DESC`).bind(...params),
      DB.prepare(`${filters} SELECT service, status, COUNT(*) AS total FROM filtered GROUP BY service, status`).bind(...params),
      DB.prepare(`${filters} SELECT date(created_at, '-5 hours') AS day, COUNT(*) AS total FROM filtered GROUP BY day ORDER BY day`).bind(...params),
    ]);
    return reply({ requests: rows.results, groups: groups.results, trend: trend.results,
      today: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10) });
  }

  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
    return reply({ error: 'Origen inválido.' }, 403);
  }

  if (request.method === 'POST' && path === '/api/requests') {
    const body = await readBody(request);
    if (!body || typeof body.service !== 'string' || !Object.hasOwn(services, body.service) ||
        !projects.includes(body.project)) {
      return reply({ error: 'Selecciona un servicio y un proyecto de ejemplo.' }, 400);
    }
    const result = await DB.prepare(`
      INSERT INTO requests (session_id, id, service, project, status, created_at)
      SELECT ?, MAX(100, COALESCE(MAX(id), 100)) + 1, ?, ?, 'new', ?
        FROM requests WHERE session_id = ? AND sample_id IS NULL
        HAVING COUNT(*) < 40
      RETURNING id
    `).bind(session, body.service, body.project, new Date().toISOString(), session).first();
    if (!result) return reply({ error: 'Alcanzaste el límite de 40 solicitudes de esta sesión.' }, 409);
    return reply(result, 201);
  }

  const item = path.match(/^\/api\/requests\/(\d{1,5})$/);
  if (request.method === 'PATCH' && item) {
    const body = await readBody(request);
    if (typeof body?.status !== 'string' || !Object.hasOwn(statuses, body.status)) {
      return reply({ error: 'Selecciona un estado válido.' }, 400);
    }
    const id = Number(item[1]);
    const result = id <= 100
      ? await DB.prepare(`
          INSERT INTO requests (session_id, id, sample_id, service, project, status, created_at)
          SELECT ?, id, id, service, project, ?, '' FROM samples WHERE id = ?
          ON CONFLICT (session_id, id) DO UPDATE SET status = excluded.status
          RETURNING id
        `).bind(session, body.status, id).first()
      : await DB.prepare(`
          UPDATE requests SET status = ? WHERE session_id = ? AND id = ? RETURNING id
        `).bind(body.status, session, id).first();
    return result ? reply(result) : reply({ error: 'No encontramos esa solicitud.' }, 404);
  }

  return reply({ error: 'Ruta desconocida.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (error) {
      console.error('Error en la API de solicitudes', error);
      return send({ error: 'No pudimos completar la operación. Intenta de nuevo.' }, 500);
    }
  },
};
