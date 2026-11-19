import { readFileSync, writeFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const [, , destination] = process.argv;
if (!destination) throw new Error('Indica la ruta del archivo HTML de salida.');

const html = read('../public/index.html');
const css = read('../public/style.css');
const favicon = read('../public/favicon.svg');
const catalog = read('../public/catalog.mjs').replaceAll('export const ', 'const ');
const app = read('../public/app.mjs').replace(/^import[^\n]*\n/, '')
  .replace(/async function api\([\s\S]*?(?=\nfunction notify)/, () => read('./preview-api.js'));
const samples = [...read('../migrations/0001_requests.sql')
  .matchAll(/\((\d+),'([^']+)','([^']+)','([^']+)',(\d+)\)/g)]
  .map(([, id, service, project, status, days]) => ({ id: Number(id), service, project, status, days: Number(days) }));

writeFileSync(destination, html
  .replace('<link rel="icon" href="/favicon.svg">', `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}">`)
  .replace('<link rel="stylesheet" href="/style.css">', () => `<style>\n${css}</style>`)
  .replace('  <script type="module" src="/app.mjs"></script>\n', '')
  .replace('Demo interactiva</span>', 'Demo local</span>')
  .replace('</body>', () => `<script>\n${catalog}\nconst sampleData = ${JSON.stringify(samples)};\n${app}</script>\n</body>`));
