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
const paginationControls = document.getElementById('paginationControls');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const currentPageEl = document.getElementById('currentPage');
const totalPagesEl = document.getElementById('totalPages');
const addTopicModal = document.getElementById('addTopicModal');
const openAddTopicModalBtn = document.getElementById('openAddTopicModal');
const closeAddTopicModalBtn = document.getElementById('closeAddTopicModal');
const cancelAddTopicBtn = document.getElementById('cancelAddTopic');
const saveTopicBtn = document.getElementById('saveTopic');
const newTopicName = document.getElementById('newTopicName');
const newTopicDestination = document.getElementById('newTopicDestination');
const newTopicCategory = document.getElementById('newTopicCategory');

const tabButtons = Array.from(document.querySelectorAll('.category-tab'));

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
  currentPage: 1,
  pageSize: 2,
  allLogs: [],
  sessionCounts: {
    all: 0,
    station: 0,
    battery: 0,
    custom: 0,
  },
  hasFilters: false,
};

function setStatus(connected) {
  wsDot.className = connected
    ? 'h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-emerald-200'
    : 'h-2.5 w-2.5 rounded-full bg-red-500 ring-4 ring-red-200';
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
  if (category === 'station') {
    return 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
  }
  if (category === 'battery') {
    return 'rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700';
  }
  if (category === 'custom') {
    return 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700';
  }
  return 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700';
}

function createBatteryBadge(parsed) {
  const soc = parsed?.data?.soc ? Number(parsed.data.soc) : null;
  if (soc === null || Number.isNaN(soc)) return null;

  const container = document.createElement('div');
  container.className = 'mt-3 inline-flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 w-fit max-w-[180px]';

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'relative h-10 w-10 shrink-0';

  const image = document.createElement('img');
  image.src = '/assets/svgs/bactery.svg';
  image.alt = 'Batterie';
  image.className = 'absolute inset-0 h-full w-full object-contain';

  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'absolute left-[16px] top-1/2 h-5 w-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[5px] bg-slate-200';

  const fill = document.createElement('div');
  fill.className = 'h-full bg-[#01BD44]';
  fill.style.width = `${Math.min(100, Math.max(0, soc))}%`;

  progressWrapper.appendChild(fill);
  iconWrapper.appendChild(image);
  iconWrapper.appendChild(progressWrapper);

  const label = document.createElement('div');
  label.className = 'flex flex-col';

  const value = document.createElement('span');
  value.className = 'font-semibold text-slate-800';
  value.textContent = `${soc}%`;

  const text = document.createElement('span');
  text.className = 'text-[11px] text-slate-500';
  text.textContent = 'Batterie';

  label.appendChild(value);
  label.appendChild(text);
  container.appendChild(iconWrapper);
  container.appendChild(label);

  return container;
}

function createLogCard(log) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rounded-3xl bg-white border border-slate-200 shadow-soft p-5';

  const parsedBody = parseBody(log.body);

  const details = document.createElement('details');
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer flex flex-col gap-3';

  const headerTop = document.createElement('div');
  headerTop.className = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';

  const titleBlock = document.createElement('div');
  titleBlock.className = 'flex flex-col gap-1';

  const title = document.createElement('div');
  title.className = 'text-base font-semibold text-ink';
  title.textContent = `Log ${log.id ? '#' + log.id : ''}`;

  const detailsLine = document.createElement('div');
  detailsLine.className = 'flex flex-wrap gap-3 text-xs text-slate-500';
  detailsLine.innerHTML = `Type : <span class="font-medium text-slate-700">${log.category || 'N/A'}</span>`;

  titleBlock.appendChild(title);
  titleBlock.appendChild(detailsLine);

  const dateBlock = document.createElement('div');
  dateBlock.className = 'text-xs text-slate-500';
  dateBlock.textContent = formatDate(log.received_at);

  headerTop.appendChild(titleBlock);
  headerTop.appendChild(dateBlock);

  let batteryBadge = null;
  if (log.category === 'battery') {
    batteryBadge = createBatteryBadge(parsedBody);
  }

  const destination = document.createElement('div');
  destination.className = 'text-sm text-slate-600 break-all';
  destination.textContent = log.destination || 'Destination inconnue';

  const badgeRow = document.createElement('div');
  badgeRow.className = 'flex items-center gap-2 flex-wrap';

  const badge = document.createElement('span');
  badge.className = getBadgeClass(log.category);
  badge.textContent = log.category ? log.category.toUpperCase() : 'LOG';

  badgeRow.appendChild(badge);

  if (batteryBadge) {
    headerTop.appendChild(batteryBadge);
  }

  headerTop.appendChild(badgeRow);

  summary.appendChild(headerTop);
  summary.appendChild(destination);

  const body = document.createElement('div');
  body.className = 'mt-4 rounded-2xl bg-mist p-4 text-sm text-slate-700';

  const pre = document.createElement('pre');
  pre.className = 'font-mono text-xs leading-relaxed whitespace-pre-wrap';

  if (typeof parsedBody === 'string') {
    pre.textContent = parsedBody;
  } else {
    pre.innerHTML = formatJson(parsedBody, 0);
  }

  body.appendChild(pre);

  details.appendChild(summary);
  details.appendChild(body);
  wrapper.appendChild(details);

  return wrapper;
}

function renderLogs(logs) {
  state.allLogs = Array.isArray(logs) ? logs : [];
  const totalItems = state.allLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));

  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }

  logsContainer.innerHTML = '';
  paginationControls.classList.toggle('hidden', totalItems === 0);
  currentPageEl.textContent = state.currentPage;
  totalPagesEl.textContent = totalPages;
  prevPageBtn.disabled = state.currentPage === 1;
  nextPageBtn.disabled = state.currentPage === totalPages;

  if (!totalItems) {
    logsEmpty.classList.remove('hidden');
    return;
  }

  logsEmpty.classList.add('hidden');
  const start = (state.currentPage - 1) * state.pageSize;
  const pageLogs = state.allLogs.slice(start, start + state.pageSize);

  pageLogs.forEach((log) => logsContainer.appendChild(createLogCard(log)));
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
  state.currentPage = 1;
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
      row.className = 'flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2';

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

      const right = document.createElement('div');
      right.className = 'flex items-center gap-2';

      const badge = document.createElement('span');
      badge.className = getBadgeClass(topic.category);
      badge.textContent = topic.category;

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600';
      deleteBtn.setAttribute('aria-label', 'Supprimer le topic');
      deleteBtn.innerHTML = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce topic ?')) return;
        try {
          await deleteTopic(Number(topic.id));
          loadTopics();
        } catch (err) {
          alert(`Impossible de supprimer le topic : ${err.message}`);
        }
      });

      right.appendChild(badge);
      right.appendChild(deleteBtn);
      row.appendChild(left);
      row.appendChild(right);
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
      tabButtons.forEach((tab) => {
        tab.className = 'category-tab rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100';
      });
      btn.className = 'category-tab rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-medium text-primary transition';
      state.category = btn.dataset.category;
      state.currentPage = 1;
      loadLogs();
    });
  });
}

function initFilters() {
  applyBtn.addEventListener('click', () => {
    state.currentPage = 1;
    loadLogs();
  });
  resetBtn.addEventListener('click', () => {
    dateFromInput.value = '';
    dateToInput.value = '';
    topicSelect.value = '';
    state.category = 'all';
    state.currentPage = 1;
    tabButtons.forEach((tab) => {
      tab.className = 'category-tab rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100';
    });
    tabButtons[0].className = 'category-tab rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-medium text-primary transition';
    loadLogs();
  });
}

function initPagination() {
  prevPageBtn.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderLogs(state.allLogs);
    }
  });

  nextPageBtn.addEventListener('click', () => {
    const totalItems = state.allLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      renderLogs(state.allLogs);
    }
  });
}

function openAddTopicModal() {
  addTopicModal.classList.remove('hidden');
  addTopicModal.setAttribute('aria-hidden', 'false');
}

function closeAddTopicModal() {
  addTopicModal.classList.add('hidden');
  addTopicModal.setAttribute('aria-hidden', 'true');
}

function resetTopicForm() {
  newTopicName.value = '';
  newTopicDestination.value = '';
  newTopicCategory.value = 'station';
}

async function saveTopic() {
  const payload = {
    name: newTopicName.value.trim(),
    destination: newTopicDestination.value.trim(),
    category: newTopicCategory.value,
  };

  if (!payload.name || !payload.destination) {
    alert('Veuillez remplir le nom et la destination du topic.');
    return;
  }

  try {
    const response = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error || 'Erreur lors de l’enregistrement';
      throw new Error(message);
    }

    closeAddTopicModal();
    resetTopicForm();
    loadTopics();
  } catch (err) {
    alert(`Impossible d’ajouter le topic : ${err.message}`);
  }
}

async function deleteTopic(topicId) {
  console.log('Request delete topic id:', topicId);
  const response = await fetch(`/api/topics/${topicId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error || `Erreur lors de la suppression (${response.status})`;
    throw new Error(message);
  }
}

function initTopicModal() {
  openAddTopicModalBtn.addEventListener('click', openAddTopicModal);
  closeAddTopicModalBtn.addEventListener('click', closeAddTopicModal);
  cancelAddTopicBtn.addEventListener('click', closeAddTopicModal);
  saveTopicBtn.addEventListener('click', saveTopic);
  addTopicModal.addEventListener('click', (event) => {
    if (event.target === addTopicModal) {
      closeAddTopicModal();
    }
  });
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  let ws = null;
  let pollingInterval = null;
  let reconnectTimeout = null;

  function startPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(() => loadLogs(), 10000);
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  function connect() {
    try {
      ws = new WebSocket(`${protocol}://${window.location.host}`);

      ws.onopen = () => {
        setStatus(true);
        stopPolling();
      };

      ws.onclose = () => {
        setStatus(false);
        startPolling();
        reconnectTimeout = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'log' && msg.data) {
            updateDate();
            updateSessionCountsFromLog(msg.data);

            if (isLogInCurrentFilter(msg.data)) {
              state.allLogs.unshift(msg.data);
              logsEmpty.classList.add('hidden');
              renderLogs(state.allLogs);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };
    } catch {
      setStatus(false);
      startPolling();
      reconnectTimeout = setTimeout(connect, 5000);
    }
  }

  connect();
}

function init() {
  updateDate();
  setStatus(false);
  initTabs();
  initFilters();
  initPagination();
  initTopicModal();
  loadTopics();
  loadLogs();
  initWebSocket();
  setInterval(updateDate, 60000);
}

init();
