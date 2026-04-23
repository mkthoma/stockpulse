export class AnimationManager {
  constructor() {
    this.brandIcon       = document.getElementById('brand-icon');
    this.queryRow        = document.querySelector('.query-row');
    this.reasoningHeader = document.querySelector('.reasoning-header');
    this.llmThinking     = document.querySelector('.llm-thinking');
    this.llmThinkingText = document.querySelector('.llm-thinking-text');
    this.toolCardsEl     = document.querySelector('.tool-cards');
  }

  onQuerySubmit() {
    this.queryRow?.classList.add('pulsing');
    setTimeout(() => this.queryRow?.classList.remove('pulsing'), 1300);
  }

  onLlmThinking(turn) {
    this.llmThinking?.classList.add('active');
    const label = turn === 0 ? 'Gemini is analysing...' : `Gemini is correlating data (turn ${turn + 1})...`;
    if (this.llmThinkingText) this.llmThinkingText.textContent = label;
    this.reasoningHeader?.classList.add('active', 'llm-glow');
  }

  onLlmDone() {
    this.llmThinking?.classList.remove('active');
    this.reasoningHeader?.classList.remove('llm-glow');
  }

  onToolCards(calls) {
    this.onLlmDone();
    if (!this.toolCardsEl) return;

    // Clear previous cards
    this.toolCardsEl.innerHTML = '';

    calls.forEach((fc, i) => {
      const card = this._makeToolCard(fc);
      card.style.animationDelay = `${i * 200}ms`;
      this.toolCardsEl.appendChild(card);
    });
  }

  onToolStart(name) {
    const card = this._getCard(name);
    card?.classList.add('running');
  }

  onToolDone(name, result, duration_ms) {
    const card = this._getCard(name);
    if (!card) return;
    card.classList.remove('running');

    const isError = result?.error;
    card.classList.add(isError ? 'error' : 'done');

    const preview = card.querySelector('.tool-result-preview');
    if (preview) {
      preview.textContent = isError
        ? `Error: ${result.error}`
        : this._summariseResult(name, result);
    }

    const dur = card.querySelector('.tool-duration');
    if (dur) dur.textContent = `${duration_ms}ms`;
  }

  onFinalAnswer() {
    this.llmThinking?.classList.remove('active');
    this.reasoningHeader?.classList.remove('active', 'llm-glow');

    // Bounce the brand icon
    this.brandIcon?.classList.remove('bounce');
    void this.brandIcon?.offsetWidth; // reflow
    this.brandIcon?.classList.add('bounce');
    setTimeout(() => this.brandIcon?.classList.remove('bounce'), 450);
  }

  reset() {
    this.llmThinking?.classList.remove('active');
    this.reasoningHeader?.classList.remove('active', 'llm-glow');
    if (this.toolCardsEl) this.toolCardsEl.innerHTML = '';
  }

  // ── Helpers ────────────────────────────────────────────────────

  _makeToolCard(fc) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.toolName = fc.name;

    const argsText = Object.entries(fc.args ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    card.innerHTML = `
      <div class="tool-card-header">
        <span class="tool-name">${fc.name}()</span>
        <span class="tool-status-dot"></span>
      </div>
      <div class="tool-args">${argsText}</div>
      <div class="tool-result-preview"></div>
      <div class="tool-duration"></div>
    `;
    return card;
  }

  _getCard(name) {
    return this.toolCardsEl?.querySelector(`[data-tool-name="${name}"]`) ?? null;
  }

  _summariseResult(name, result) {
    if (!Array.isArray(result)) return 'Done';
    switch (name) {
      case 'get_stock_price':  return `${result.length} price records returned`;
      case 'search_news':      return `${result.length} articles found`;
      case 'correlate_price_to_news': return `${result.length} days correlated`;
      default: return `${result.length} items returned`;
    }
  }
}
