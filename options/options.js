'use strict';

const GEMINI_RE = /^AIza[0-9A-Za-z\-_]{35}$/;

// ── Settings ────────────────────────────────────────────────────

async function load() {
  const stored = await chrome.storage.local.get(['geminiApiKey', 'newsApiKey', 'settings']);
  if (stored.geminiApiKey) document.getElementById('gemini-key').value = stored.geminiApiKey;
  if (stored.newsApiKey)   document.getElementById('news-key').value   = stored.newsApiKey;
  if (stored.settings?.model) {
    const sel = document.getElementById('model-select');
    const opt = [...sel.options].find(o => o.value === stored.settings.model);
    if (opt) opt.selected = true;
  }
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const geminiKey = document.getElementById('gemini-key').value.trim();
  const newsKey   = document.getElementById('news-key').value.trim();
  const model     = document.getElementById('model-select').value;

  if (geminiKey && !GEMINI_RE.test(geminiKey)) {
    showStatus('⚠ Gemini key looks invalid (should start with AIza)', true);
    return;
  }

  await chrome.storage.local.set({
    geminiApiKey: geminiKey,
    newsApiKey:   newsKey,
    settings:     { model }
  });

  showStatus('✓ Saved!', false);
});

document.querySelectorAll('.btn-reveal').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.for);
    input.type = input.type === 'password' ? 'text' : 'password';
    const isHidden = input.type === 'password';
    btn.innerHTML = isHidden
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;pointer-events:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;pointer-events:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  });
});

function showStatus(msg, isError) {
  const el = document.getElementById('save-status');
  el.textContent = msg;
  el.style.color = isError ? '#DC2626' : '#40916C';
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3000);
}

// ── LLM Logs ────────────────────────────────────────────────────

document.getElementById('refresh-logs').addEventListener('click', renderLogs);

document.getElementById('clear-logs').addEventListener('click', async () => {
  if (!confirm('Clear all LLM call logs?')) return;
  await chrome.storage.local.remove('llmLogs');
  renderLogs();
});

async function renderLogs() {
  const container = document.getElementById('logs-container');
  const empty     = document.getElementById('logs-empty');
  const stored    = await chrome.storage.local.get('llmLogs');
  const logs      = (stored.llmLogs ?? []).slice().reverse(); // newest first

  // Remove existing cards (keep the empty notice)
  container.querySelectorAll('.log-card').forEach(el => el.remove());

  if (logs.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  for (const entry of logs) {
    const card = buildLogCard(entry);
    container.appendChild(card);
  }
}

function buildLogCard(entry) {
  const card = document.createElement('div');
  card.className = 'log-card';

  const isError    = !!entry.error;
  const statusIcon = isError ? '❌' : '✓';
  const statusCls  = isError ? 'log-status-err' : 'log-status-ok';

  const parts = entry.response?.parts ?? [];
  const fnCalls = parts.filter(p => p.type === 'functionCall');
  const hasText = parts.some(p => p.type === 'text');
  const responseLabel = isError
    ? `Error`
    : fnCalls.length > 0
      ? `${fnCalls.length} tool call${fnCalls.length > 1 ? 's' : ''}`
      : hasText ? 'Final answer' : '—';

  const usage = entry.response?.usageMetadata;
  const tokenInfo = usage
    ? `${usage.promptTokenCount ?? '?'} in / ${usage.candidatesTokenCount ?? '?'} out`
    : '';

  // Header row
  const header = document.createElement('div');
  header.className = 'log-card-header';
  header.innerHTML = `
    <span class="log-status ${statusCls}">${statusIcon}</span>
    <span class="log-time">${formatTime(entry.timestamp)}</span>
    <span class="log-model">${entry.model}</span>
    <span class="log-response-type">${responseLabel}</span>
    <span class="log-duration">${entry.duration_ms != null ? entry.duration_ms + 'ms' : ''}</span>
    <button class="log-toggle" aria-label="Expand">▼</button>
  `;

  // Detail body (hidden by default)
  const detail = document.createElement('div');
  detail.className = 'log-detail';
  detail.hidden    = true;

  const rows = [
    ['Timestamp',     entry.timestamp],
    ['Model',         entry.model],
    ['Attempt',       entry.attempt],
    ['History depth', entry.request?.contentsCount ?? '—'],
    ['Last roles',    (entry.request?.lastRoles ?? []).join(' → ')],
    ['Finish reason', entry.response?.finishReason ?? (isError ? 'ERROR' : '—')],
    ['Tokens',        tokenInfo || '—'],
    ['Duration',      entry.duration_ms != null ? `${entry.duration_ms}ms` : '—'],
  ];

  if (isError) rows.push(['Error', entry.error]);

  const table = document.createElement('table');
  table.className = 'log-table';
  for (const [label, value] of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th>${esc(label)}</th><td>${esc(String(value))}</td>`;
    table.appendChild(tr);
  }
  detail.appendChild(table);

  // Parts breakdown
  if (parts.length > 0) {
    const partsTitle = document.createElement('div');
    partsTitle.className = 'log-parts-title';
    partsTitle.textContent = 'Response parts:';
    detail.appendChild(partsTitle);

    for (const p of parts) {
      const partEl = document.createElement('div');
      partEl.className = 'log-part';
      if (p.type === 'functionCall') {
        partEl.innerHTML = `<span class="log-part-badge fn">tool</span> <code>${esc(p.name)}(${esc(JSON.stringify(p.args))})</code>`;
      } else if (p.type === 'text') {
        partEl.innerHTML = `<span class="log-part-badge txt">text</span> <span class="log-part-text">${esc(p.preview)}${p.preview?.length >= 120 ? '…' : ''}</span>`;
      } else if (p.type === 'functionResponse') {
        partEl.innerHTML = `<span class="log-part-badge res">result</span> <code>${esc(p.name)}</code>`;
      }
      detail.appendChild(partEl);
    }
  }

  // Toggle expand/collapse
  const toggleBtn = header.querySelector('.log-toggle');
  toggleBtn.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    toggleBtn.textContent = detail.hidden ? '▼' : '▲';
    card.classList.toggle('expanded', !detail.hidden);
  });

  card.appendChild(header);
  card.appendChild(detail);
  return card;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + ' ' +
         d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ────────────────────────────────────────────────────────
load();
renderLogs();
