const storageKey = 'nexo-cotiza-demo-v1';
let previewData = { overrides: {}, requests: [] };
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) previewData = JSON.parse(saved);
} catch {
  // The standalone demo can run in memory when local storage is unavailable.
}

function persistPreview() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(previewData));
  } catch {
    // The current page still reflects the change.
  }
}

function isoDay(time) {
  return new Date(time - 5 * 3600000).toISOString().slice(0, 10);
}

async function api(path, method = 'GET', payload) {
  if (method === 'POST') {
    if (previewData.requests.length >= 40) throw new Error('Alcanzaste el límite de 40 solicitudes de esta demo.');
    const id = 101 + previewData.requests.length;
    previewData.requests.push({ id, ...payload, status: 'new', created_at: new Date().toISOString() });
    persistPreview();
    return { id };
  }

  if (method === 'PATCH') {
    const id = Number(path.split('/')[1]);
    const item = previewData.requests.find((row) => row.id === id);
    if (item) item.status = payload.status;
    else previewData.overrides[id] = payload.status;
    persistPreview();
    return { id };
  }

  const now = Date.now();
  const params = new URLSearchParams(path.split('?')[1]);
  const period = Number(params.get('period'));
  const serviceFilter = params.get('service');
  const statusFilter = params.get('status');
  const dayLength = 86400000;
  const cutoff = isoDay(now - (period - 1) * dayLength);
  const samples = sampleData.map(({ id, service, project, status, days }) => ({
    id, service, project, status: previewData.overrides[id] || status,
    created_at: new Date(now - days * dayLength).toISOString(),
  }));
  const requests = [...samples, ...previewData.requests].filter((row) =>
    isoDay(Date.parse(row.created_at)) >= cutoff &&
    (serviceFilter === 'all' || serviceFilter === row.service) &&
    (statusFilter === 'all' || statusFilter === row.status)
  ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const groups = new Map();
  const trend = new Map();
  for (const { service, status, created_at } of requests) {
    const key = service + '/' + status;
    if (!groups.has(key)) groups.set(key, { service, status, total: 0 });
    groups.get(key).total++;
    const day = isoDay(Date.parse(created_at));
    trend.set(day, (trend.get(day) || 0) + 1);
  }
  return { requests, groups: [...groups.values()],
    trend: [...trend].map(([day, total]) => ({ day, total })), today: isoDay(now) };
}
