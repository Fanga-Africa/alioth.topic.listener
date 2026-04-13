const logsContainer = document.getElementById('logs');
const logsEmpty = document.getElementById('logsEmpty');
const wsStatus = document.getElementById('ws-status');
const wsDot = document.getElementById('ws-dot');
const currentDate = document.getElementById('current-date');
const topicSelect = document.getElementById('topicSelect');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const applyBtn = document.getElementById('applyFilters');
const resetBtn = document.getElementById('resetFilters');
const totalLogsEl = document.getElementById('totalLogs');

const tabButtons = Array.from(document.querySelectorAll('.tab-button'));

const countEls = {
  all: document.getElementById('count-all'),
  station: document.getElementById('count-station'),
  battery: document.getElementById('count-battery'),
  custom: document.getElementById('count-custom'),
};

const state = {
  category: 'all',
  destination: '',
  dateFrom: '',
  dateTo: '',
  sessionCounts: {
    all: 0,
    station: 0,
    battery: 0,
    custom: 0,
  },
  hasFilters: false,
};

function setStatus(connected) {
  wsDot.classList.toggle('online', connected);
  wsDot.classList.toggle('offline', !connected);
  wsStatus.textContent = connected ? 'Connecté' : 'Déconnecté';
}

function updateDate() {
  const now = new Date();
  currentDate.textContent = now.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatJson(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (value === null) {
    return '<span class="json-null">null</span>';
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map((item) => `${pad}  ${formatJson(item, indent + 1)}`);
    return `[
${items.join(',\n')}
${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const lines = entries.map(([key, val]) => {
      const safeKey = escapeHtml(key);
      return `${pad}  <span class="json-key">"${safeKey}"</span>: ${formatJson(val, indent + 1)}`;
    });
    return `{
${lines.join(',\n')}
${pad}}`;
  }
  if (typeof value === 'string') {
    return `<span class="json-string">"${escapeHtml(value)}"</span>`;
  }
  if (typeof value === 'number') {
    return `<span class="json-number">${value}</span>`;
  }
  if (typeof value === 'boolean') {
    return `<span class="json-boolean">${value}</span>`;
  }
  return `<span>${escapeHtml(String(value))}</span>`;
}

function parseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function formatDate(value) {
  if (!value) return '�';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function getBadgeClass(category) {
  if (category === 'station') return 'badge station';
  if (category === 'battery') return 'badge battery';
  if (category === 'custom') return 'badge custom';
  return 'badge';
}

function createLogCard(log) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-surface rounded-3xl p-5';

  const details = document.createElement('details');
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer flex flex-col gap-2 md:flex-row md:items-center md:justify-between';

  const left = document.createElement('div');
  left.className = 'flex flex-col gap-1';

  const title = document.createElement('div');
  title.className = 'text-sm font-semibold text-ink';
  title.textContent = `Log ${log.id ? '#' + log.id : ''}`;

  const destination = document.createElement('div');
  destination.className = 'text-xs text-slate-500 break-all';
  destination.textContent = log.destination || 'Destination inconnue';

  left.appendChild(title);
  left.appendChild(destination);

  const right = document.createElement('div');
  right.className = 'flex items-center gap-3 text-xs text-slate-500';

  const badge = document.createElement('span');
  badge.className = getBadgeClass(log.category);
  badge.textContent = log.category ? log.category.toUpperCase() : 'LOG';

  const time = document.createElement('span');
  time.textContent = formatDate(log.received_at);

  right.appendChild(badge);
  right.appendChild(time);

  summary.appendChild(left);
  summary.appendChild(right);

  const body = document.createElement('div');
  body.className = 'mt-4 rounded-2xl bg-mist p-4 text-sm text-slate-700';

  const pre = document.createElement('pre');
  pre.className = 'font-mono text-xs leading-relaxed whitespace-pre-wrap';

  const parsed = parseBody(log.body);
  if (typeof parsed === 'string') {
    pre.textContent = parsed;
  } else {
    pre.innerHTML = formatJson(parsed, 0);
  }

  body.appendChild(pre);

  details.appendChild(summary);
  details.appendChild(body);
  wrapper.appendChild(details);

  return wrapper;
}

function renderLogs(logs) {
  logsContainer.innerHTML = '';

  if (!logs.length) {
    logsEmpty.classList.remove('hidden');
    return;
  }

  logsEmpty.classList.add('hidden');
  logs.forEach((log) => logsContainer.appendChild(createLogCard(log)));
}

function updateCounts(counts) {
  totalLogsEl.textContent = counts.all;
  countEls.all.textContent = counts.all;
  countEls.station.textContent = counts.station;
  countEls.battery.textContent = counts.battery;
  countEls.custom.textContent = counts.custom;
}

function computeCounts(logs) {
  const counts = {
    all: 0,
    station: 0,
    battery: 0,
    custom: 0,
  };

  logs.forEach((log) => {
    counts.all += 1;
    if (log.category && counts[log.category] !== undefined) {
      counts[log.category] += 1;
    }
  });

  return counts;
}

function buildQuery() {
  const params = new URLSearchParams();

  if (state.category && state.category !== 'all') {
    params.set('category', state.category);
  }

  if (state.destination) {
    params.set('destination', state.destination);
  }

  if (state.dateFrom) {
    params.set('date_from', new Date(state.dateFrom).toISOString());
  }

  if (state.dateTo) {
    params.set('date_to', new Date(state.dateTo).toISOString());
  }

  return params.toString();
}

function updateFiltersState() {
  state.destination = topicSelect.value;
  state.dateFrom = dateFromInput.value;
  state.dateTo = dateToInput.value;

  state.hasFilters = Boolean(
    state.category !== 'all' ||
    state.destination ||
    state.dateFrom ||
    state.dateTo
  );
}

async function loadLogs() {
  updateFiltersState();
  const query = buildQuery();
  const url = query ? `/api/logs?${query}` : '/api/logs';

  const res = await fetch(url);
  const data = await res.json();

  renderLogs(data.logs || []);

  if (!state.hasFilters || state.sessionCounts.all === 0) {
    state.sessionCounts = computeCounts(data.logs || []);
  }
  updateCounts(state.sessionCounts);
}

function isLogInCurrentFilter(log) {
  if (state.category !== 'all' && log.category !== state.category) return false;
  if (state.destination && log.destination !== state.destination) return false;
  if (state.dateFrom) {
    const from = new Date(state.dateFrom).getTime();
    const received = new Date(log.received_at).getTime();
    if (received < from) return false;
  }
  if (state.dateTo) {
    const to = new Date(state.dateTo).getTime();
    const received = new Date(log.received_at).getTime();
    if (received > to) return false;
  }
  return true;
}

function updateSessionCountsFromLog(log) {
  state.sessionCounts.all += 1;
  if (log.category && state.sessionCounts[log.category] !== undefined) {
    state.sessionCounts[log.category] += 1;
  }
  updateCounts(state.sessionCounts);
}

async function loadTopics() {
  const container = document.getElementById('topicsList');
  try {
    const res = await fetch('/api/topics');
    const topics = await res.json();

    container.innerHTML = '';
    topicSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Tous les topics';
    topicSelect.appendChild(allOption);

    if (!topics.length) {
      container.innerHTML = '<div class="text-slate-400">Aucun topic enregistr�</div>';
      return;
    }

    topics.forEach((topic) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2';

      const left = document.createElement('div');
      left.className = 'flex flex-col';

      const name = document.createElement('span');
      name.className = 'text-sm font-medium text-ink';
      name.textContent = topic.name;

      const dest = document.createElement('span');
      dest.className = 'text-[11px] text-slate-400 break-all';
      dest.textContent = topic.destination;

      left.appendChild(name);
      left.appendChild(dest);

      const badge = document.createElement('span');
      badge.className = getBadgeClass(topic.category);
      badge.textContent = topic.category;

      row.appendChild(left);
      row.appendChild(badge);
      container.appendChild(row);

      const option = document.createElement('option');
      option.value = topic.destination;
      option.textContent = topic.name;
      topicSelect.appendChild(option);
    });
  } catch (err) {
    container.innerHTML = '<div class="text-slate-400">Impossible de charger les topics</div>';
  }
}

function initTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((tab) => tab.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.category;
      loadLogs();
    });
  });
}

function initFilters() {
  applyBtn.addEventListener('click', () => loadLogs());
  resetBtn.addEventListener('click', () => {
    dateFromInput.value = '';
    dateToInput.value = '';
    topicSelect.value = '';
    state.category = 'all';
    tabButtons.forEach((tab) => tab.classList.remove('active'));
    tabButtons[0].classList.add('active');
    loadLogs();
  });
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}`);

  ws.onopen = () => setStatus(true);
  ws.onclose = () => setStatus(false);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'log' && msg.data) {
        updateDate();
        updateSessionCountsFromLog(msg.data);

        if (isLogInCurrentFilter(msg.data)) {
          logsEmpty.classList.add('hidden');
          logsContainer.prepend(createLogCard(msg.data));
        }
      }
    } catch {
      // ignore malformed messages
    }
  };
}

function init() {
  updateDate();
  setStatus(false);
  initTabs();
  initFilters();
  loadTopics();
  loadLogs();
  initWebSocket();
  setInterval(updateDate, 60000);
}

init();
