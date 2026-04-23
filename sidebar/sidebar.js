import { AnimationManager } from './AnimationManager.js';
import { ReasoningChain }   from './ReasoningChain.js';
import { TimelineChart }    from './TimelineChart.js';
import { ResultsPanel }     from './ResultsPanel.js';

// Parent frame is the host web page — origin is unknown at compile time, so use '*'.
// Safe: outbound messages contain only commands/queries, never credentials.
const PARENT_ORIGIN = '*';

const anim    = new AnimationManager();
const chain   = new ReasoningChain();
const chart   = new TimelineChart();
const results = new ResultsPanel();

let running       = false;
let correlatedData= null;

// ── Query submission ────────────────────────────────────────────

document.getElementById('analyse-btn').addEventListener('click', submitQuery);
document.getElementById('query-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) submitQuery();
});

function submitQuery() {
  const input = document.getElementById('query-input');
  const query = input.value.trim();
  if (!query || running) return;

  resetAll();
  running = true;
  setAnalysing(true);
  anim.onQuerySubmit();

  window.parent.postMessage(
    { source: 'stockpulse-sidebar', type: 'RUN_AGENT', payload: { query } },
    PARENT_ORIGIN
  );
}

// ── Settings / close buttons ────────────────────────────────────

document.getElementById('settings-btn').addEventListener('click', () => {
  window.parent.postMessage(
    { source: 'stockpulse-sidebar', type: 'OPEN_OPTIONS' },
    PARENT_ORIGIN
  );
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.parent.postMessage(
    { source: 'stockpulse-sidebar', type: 'CLOSE_SIDEBAR' },
    PARENT_ORIGIN
  );
});

// ── Receive step events from background (via content script) ────

window.addEventListener('message', event => {
  // event.origin here is the web page's origin (content script runs in that context),
  // so we can't check against BG_ORIGIN. Verify by source field instead.
  if (event.data?.source !== 'stockpulse-bg') return;

  handleStep(event.data.payload);
});

function handleStep(step) {
  switch (step.type) {
    case 'query_received':
      chain.addStep(step);
      break;

    case 'llm_thinking':
      chain.addStep(step);
      anim.onLlmThinking(step.turn);
      break;

    case 'tool_calls':
      chain.addStep(step);
      anim.onToolCards(step.calls);
      break;

    case 'tool_start':
      chain.addStep(step);
      anim.onToolStart(step.name);
      break;

    case 'tool_done':
      chain.addStep(step);
      anim.onToolDone(step.name, step.result, step.duration_ms);

      if (step.name === 'correlate_price_to_news' && Array.isArray(step.result)) {
        correlatedData = step.result;
      }
      break;

    case 'final_answer':
      chain.addStep(step);
      anim.onFinalAnswer();
      setAnalysing(false);
      running = false;

      if (correlatedData) {
        chart.render(correlatedData);
        results.showTimeline(correlatedData);
      }
      results.showAnswer(step.text);
      break;

    case 'error':
      chain.addStep(step);
      anim.onLlmDone();
      setAnalysing(false);
      running = false;
      results.showError(step.message);
      break;
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function resetAll() {
  correlatedData = null;
  anim.reset();
  chain.reset();
  chart.reset();
  results.reset();
}

function setAnalysing(on) {
  const btn   = document.getElementById('analyse-btn');
  const input = document.getElementById('query-input');
  btn.disabled   = on;
  input.disabled = on;

  if (on) {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
           style="width:12px;height:12px;animation:spin 0.85s linear infinite">
        <line x1="12" y1="2"  x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="4.93" y1="4.93"  x2="7.76" y2="7.76"/>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
        <line x1="2" y1="12"  x2="6"  y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
      </svg>
      Analysing`;
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
           style="width:12px;height:12px">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Analyse`;
  }
}
