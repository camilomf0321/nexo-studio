import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.mjs';

const localData = new URL('../.data/', import.meta.url);
mkdirSync(localData, { recursive: true });
const database = new DatabaseSync(new URL('local.sqlite', localData));
database.exec(readFileSync(new URL('../migrations/0001_requests.sql', import.meta.url), 'utf8'));

const DB = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          all: () => ({ results: database.prepare(sql).all(...values) }),
          first: () => database.prepare(sql).get(...values),
        };
      },
    };
  },
  batch: async (statements) => statements.map((statement) => statement.all()),
};

const filenames = new Map([
  ['/', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/catalog.mjs', ['catalog.mjs', 'text/javascript']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

const ASSETS = {
  fetch(request) {
    const file = filenames.get(new URL(request.url).pathname);
    if (!file) return new Response('No encontrado', { status: 404 });
    const [name, mime] = file;
    const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(new URL(`../public/${name}`, import.meta.url)));
    return new Response(body, { headers: { 'Content-Type': `${mime}; charset=UTF-8` } });
  },
};

const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  try {
    const readOnly = req.method === 'GET' || req.method === 'HEAD';
    const request = new Request(new URL(req.url, `http://${req.headers.host}`), {
      method: req.method,
      headers: req.headers,
      ...(readOnly ? {} : { body: Readable.toWeb(req), duplex: 'half' }),
    });
    const response = await worker.fetch(request, { DB, ASSETS });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch {
    res.writeHead(500).end('Error al atender la solicitud');
  }
}).listen(port, '127.0.0.1', () => console.log(`Nexo Demo · http://127.0.0.1:${port}`));
