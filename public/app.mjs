import { projects, services, statuses } from './catalog.mjs';

const drawing = {
  logo: '<path d="M4 17V7h4l8 10h4V7M4 17h4l8-10h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  inbox: '<path d="M4 4h16l2 9v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6l2-9Z"/><path d="M2 13h6l2 3h4l2-3h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  external: '<path d="M13 4h7v7m0-7-9 9m7 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  flask: '<path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-13 5-2 2 2 2m8-4 2 2-2 2"/>',
  diamond: '<path d="M3 9l4-5h10l4 5-9 11-9-11Zm0 0h18M9 4l-2 5 5 11 5-11-2-5"/>',
  chart: '<path d="M4 4v16h16M8 16v-4m5 4V8m5 8V5"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

const $ = (id) => document.getElementById(id);
const views = { resumen: 'Resumen', solicitudes: 'Solicitudes', servicios: 'Portal de servicios' };
const format = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
const formatISO = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dialog = $('request-dialog');
const form = $('request-form');
const filters = ['period', 'service', 'status'];
let currentView;
let sequence = 0;
let notification;
let pendingCreate = false;
let pendingUpdate = false;
let data;

function icon(name) {
  return `<i data-icon="${name}"></i>`;
}

function paintIcons(container = document) {
  container.querySelectorAll('i[data-icon]:empty').forEach((node) => {
    node.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${drawing[node.dataset.icon]}</svg>`;
  });
}

function option(select, value, label) {
  select.add(new Option(label, value));
}

Object.entries(services).forEach(([key, service]) => {
  option($('service'), key, service.name);
  option($('request-service'), key, service.name);
});
Object.entries(statuses).forEach(([key, label]) => option($('status'), key, label));
projects.forEach((name) => option($('project'), name, name));

$('services-grid').innerHTML = Object.entries(services).map(([key, service]) => `
  <article class="card service-card" data-tone="${key}">
    <span class="metric-icon">${icon(service.icon)}</span>
    <h3>${service.name}</h3><p>${service.description}</p>
    <button class="quiet" data-open="${key}">Solicitar cotización ${icon('arrow')}</button>
  </article>`).join('');
paintIcons();

function navigate() {
  const route = location.hash.slice(1);
  const next = Object.hasOwn(views, route) ? route : 'resumen';
  if (next === currentView) return;
  const firstView = currentView === undefined;
  currentView = next;
  $('crumb').textContent = views[next];
  $('summary-view').hidden = next !== 'resumen';
  $('analytics').hidden = next !== 'resumen';
  $('requests-intro').hidden = next !== 'solicitudes';
  $('portal-view').hidden = next !== 'servicios';
  $('dashboard').hidden = next === 'servicios';
  $('dashboard-heading').textContent = next === 'solicitudes' ? 'Filtros' : 'Indicadores';
  $('all-link').hidden = next === 'solicitudes';
  $('table-heading').textContent = next === 'solicitudes' ? 'Historial de solicitudes' : 'Solicitudes recientes';
  document.querySelectorAll('nav [data-route]').forEach((link) => {
    if (link.dataset.route === next) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (data) renderTable(data.requests);
  if (!firstView) {
    window.scrollTo(0, 0);
    $('main').focus({ preventScroll: true });
  }
}

async function api(path, method = 'GET', payload) {
  const response = await fetch('/api/' + path, {
    method,
    ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No pudimos completar la operación.');
  return result;
}

function notify(message) {
  clearTimeout(notification);
  $('toast').textContent = message;
  notification = setTimeout(() => { $('toast').textContent = ''; }, 5400);
}

function renderMetrics(groups) {
  const statusCount = Object.fromEntries(Object.keys(statuses).map((status) => [status, 0]));
  let total = 0;
  for (const row of groups) {
    statusCount[row.status] += row.total;
    total += row.total;
  }
  const metrics = [
    ['Solicitudes', total, 'inbox', 'new', 'Registros en la selección'],
    ['Contactadas', statusCount.contacted, 'globe', 'contacted', 'En seguimiento'],
    ['Cotizadas', statusCount.quoted, 'file', 'quoted', 'Con propuesta preparada'],
    ['Cerradas', statusCount.closed, 'check', 'closed', 'Seguimiento finalizado'],
  ];
  $('metrics').innerHTML = metrics.map(([label, value, image, tone, caption]) => `
    <article class="card metric" data-tone="${tone}">
      <h3 class="metric-head"><span class="metric-icon">${icon(image)}</span>${label}</h3>
      <strong>${value}</strong><p>${caption}</p>
    </article>`).join('');
  paintIcons($('metrics'));
}

function renderCharts({ groups, trend, today }) {
  const days = Number($('period').value);
  const step = { 7: 1, 30: 5, 90: 15 }[days];
  const end = Date.parse(today);
  const dayLength = 86400000;
  const start = end - (days - 1) * dayLength;
  const counts = new Map(trend.map(({ day, total }) => [Date.parse(day), total]));
  const buckets = [];
  for (let first = start; first <= end; first += step * dayLength) {
    let total = 0;
    const last = Math.min(first + (step - 1) * dayLength, end);
    for (let date = first; date <= last; date += dayLength) total += counts.get(date) || 0;
    buckets.push({ first, last, total });
  }
  const maximum = Math.max(1, ...buckets.map(({ total }) => total));
  $('trend').innerHTML = `<div class="bar-grid" style="--columns:${buckets.length}">${buckets.map(({ first, last, total }) => {
    const label = formatISO.format(first);
    const interval = first === last ? label : `${label} a ${formatISO.format(last)}`;
    return `<div class="bar-column" data-empty="${total === 0}" role="img" aria-label="${interval}, ${total} solicitudes" title="${interval} · ${total} solicitudes"><strong aria-hidden="true">${total}</strong><b aria-hidden="true" style="height:${total / maximum * 70}px"></b><span aria-hidden="true">${label}</span></div>`;
  }).join('')}</div>`;

  const totals = Object.fromEntries(Object.keys(services).map((key) => [key, 0]));
  let grandTotal = 0;
  groups.forEach(({ service, total }) => { totals[service] += total; grandTotal += total; });
  $('breakdown').innerHTML = `<ul class="service-bars">${Object.entries(services).map(([key, service]) => {
    const total = totals[key];
    const share = grandTotal ? Math.round(total / grandTotal * 100) : 0;
    return `<li class="service-bar" data-tone="${key}"><span>${service.name}</span><strong>${total} · ${share} %</strong><div class="service-track"><b style="width:${share}%"></b></div></li>`;
  }).join('')}</ul>`;
}

function renderTable(rows) {
  const visible = currentView === 'resumen' ? rows.slice(0, 5) : rows;
  const body = $('request-rows');
  const focus = body.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  $('table-caption').textContent = rows.length ? `${visible.length} de ${rows.length} registros en la selección` : '';
  body.replaceChildren();
  if (!rows.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 4;
    cell.className = 'empty';
    cell.textContent = 'No hay solicitudes con estos filtros.';
    return;
  }
  for (const item of visible) {
    const row = body.insertRow();
    const project = row.insertCell();
    const code = document.createElement('small');
    code.textContent = `#${String(item.id).padStart(3, '0')}`;
    project.append(code, item.project);
    row.insertCell().textContent = services[item.service].name;
    row.insertCell().textContent = format.format(new Date(item.created_at));
    const select = document.createElement('select');
    select.className = 'status-select';
    select.dataset.id = item.id;
    select.dataset.tone = item.status;
    select.setAttribute('aria-label', `Estado de ${item.project}, solicitud ${item.id}`);
    select.disabled = pendingUpdate;
    Object.entries(statuses).forEach(([key, label]) => option(select, key, label));
    select.value = item.status;
    row.insertCell().append(select);
  }
  if (focus) body.querySelector(`[data-id="${focus}"]`)?.focus();
}

async function refresh() {
  const call = ++sequence;
  const query = new URLSearchParams(filters.map((key) => [key, $(key).value]));
  $('load-status').textContent = 'Actualizando solicitudes…';
  try {
    const result = await api(`dashboard?${query}`);
    if (call !== sequence) return;
    data = result;
    renderMetrics(result.groups);
    renderCharts(result);
    renderTable(result.requests);
    $('load-status').textContent = '';
  } catch {
    if (call === sequence) {
      $('load-status').textContent = data
        ? 'No se pudo actualizar el tablero. Se muestran los últimos resultados.'
        : 'No se pudo cargar el tablero. Cambia un filtro o recarga la página.';
    }
  }
}

document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => {
    form.reset();
    $('request-service').value = button.dataset.open;
    $('form-error').textContent = '';
    dialog.showModal();
  });
});
for (const name of ['close-dialog', 'cancel-dialog']) {
  $(name).addEventListener('click', () => { if (!pendingCreate) dialog.close(); });
}
dialog.addEventListener('cancel', (event) => { if (pendingCreate) event.preventDefault(); });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pendingCreate) return;
  pendingCreate = true;
  $('submit-request').disabled = true;
  $('form-error').textContent = '';
  try {
    await initialLoad;
    const result = await api('requests', 'POST', Object.fromEntries(new FormData(form)));
    dialog.close();
    $('status').value = 'all';
    $('service').value = 'all';
    location.hash = 'solicitudes';
    navigate();
    await refresh();
    notify(`Solicitud #${String(result.id).padStart(3, '0')} guardada.`);
  } catch (error) {
    $('form-error').textContent = error.message;
  } finally {
    pendingCreate = false;
    $('submit-request').disabled = false;
  }
});

$('request-rows').addEventListener('change', async (event) => {
  const select = event.target.closest('select[data-id]');
  if (!select || pendingUpdate) return;
  pendingUpdate = true;
  const container = $('request-rows');
  container.querySelectorAll('select').forEach((input) => { input.disabled = true; });
  try {
    await api(`requests/${select.dataset.id}`, 'PATCH', { status: select.value });
    pendingUpdate = false;
    await refresh();
    notify(`Estado actualizado a ${statuses[select.value]}.`);
  } catch (error) {
    select.value = select.dataset.tone;
    notify(error.message);
  } finally {
    pendingUpdate = false;
    container.querySelectorAll('select').forEach((input) => { input.disabled = false; });
    if (container.contains(select) && document.activeElement === document.body) select.focus();
  }
});

document.querySelector('.skip').addEventListener('click', (event) => {
  event.preventDefault();
  $('main').focus();
});
window.addEventListener('hashchange', navigate);
navigate();
const initialLoad = refresh();
filters.forEach((key) => $(key).addEventListener('change', refresh));
