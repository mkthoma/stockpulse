const ICONS = {
  query_received: '💬',
  llm_thinking:   '🤔',
  tool_calls:     '🔧',
  tool_start:     '⏳',
  tool_done:      '✅',
  final_answer:   '🎯',
  error:          '❌'
};

export class ReasoningChain {
  constructor() {
    this.stepsList = document.querySelector('.steps-list');
    this.steps = [];
  }

  addStep(step) {
    const item = this._buildItem(step);
    if (!item) return;

    this.steps.push(step);
    this.stepsList?.appendChild(item);

    // Auto-scroll into view
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  reset() {
    this.steps = [];
    if (this.stepsList) this.stepsList.innerHTML = '';
  }

  // ── Private ────────────────────────────────────────────────────

  _buildItem(step) {
    const li = document.createElement('li');
    li.className = 'step-item';

    const time   = this._now();
    const icon   = ICONS[step.type] ?? '•';
    const label  = this._label(step);
    const detail = this._detail(step);

    li.innerHTML = `
      <span class="step-icon">${icon}</span>
      <div class="step-body">
        <div class="step-label">${label}</div>
        ${detail ? `<div class="step-detail">${detail}</div>` : ''}
      </div>
      <span class="step-time">${time}</span>
    `;

    return li;
  }

  _label(step) {
    switch (step.type) {
      case 'query_received': return `Query: "${this._truncate(step.query, 40)}"`;
      case 'llm_thinking':   return step.turn === 0 ? 'LLM decision — fetching data' : `LLM turn ${step.turn + 1} — analysing`;
      case 'tool_calls':     return `Dispatching ${step.calls.length} tool(s)`;
      case 'tool_start':     return `${step.name}() — started`;
      case 'tool_done':      return `${step.name}() — done`;
      case 'final_answer':   return 'Final answer generated';
      case 'error':          return 'Error';
      default:               return step.type;
    }
  }

  _detail(step) {
    switch (step.type) {
      case 'tool_start': {
        const args = Object.entries(step.args ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        return args || null;
      }
      case 'tool_done': {
        if (step.result?.error) return `Error: ${step.result.error}`;
        if (Array.isArray(step.result)) return `${step.result.length} records · ${step.duration_ms}ms`;
        return `${step.duration_ms}ms`;
      }
      case 'error': return step.message;
      default: return null;
    }
  }

  _now() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  _truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }
}
