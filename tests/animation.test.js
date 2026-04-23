/**
 * DOM state tests for AnimationManager and ReasoningChain.
 * Run with: npx jest tests/animation.test.js --testEnvironment jsdom
 */

import { AnimationManager } from '../sidebar/AnimationManager.js';
import { ReasoningChain }   from '../sidebar/ReasoningChain.js';

function buildDOM() {
  document.body.innerHTML = `
    <span class="brand-icon">📈</span>
    <div class="query-row"></div>
    <div class="reasoning-header"><span class="status-dot"></span></div>
    <div class="llm-thinking"><span class="llm-thinking-text"></span></div>
    <div class="tool-cards"></div>
    <ul class="steps-list"></ul>
  `;
}

// ── AnimationManager ────────────────────────────────────────────

describe('AnimationManager', () => {
  let anim;

  beforeEach(() => {
    buildDOM();
    anim = new AnimationManager();
  });

  test('onLlmThinking adds active class to llm-thinking', () => {
    anim.onLlmThinking(0);
    expect(document.querySelector('.llm-thinking').classList.contains('active')).toBe(true);
  });

  test('onLlmThinking sets correct text for turn 0', () => {
    anim.onLlmThinking(0);
    expect(document.querySelector('.llm-thinking-text').textContent).toContain('analysing');
  });

  test('onLlmDone removes active class from llm-thinking', () => {
    anim.onLlmThinking(0);
    anim.onLlmDone();
    expect(document.querySelector('.llm-thinking').classList.contains('active')).toBe(false);
  });

  test('onToolCards renders a card for each function call', () => {
    anim.onToolCards([
      { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } },
      { name: 'search_news',     args: { query: 'Tesla', from_date: '2026-04-13' } }
    ]);
    const cards = document.querySelectorAll('.tool-card');
    expect(cards).toHaveLength(2);
  });

  test('onToolDone marks card as done', () => {
    anim.onToolCards([{ name: 'get_stock_price', args: {} }]);
    anim.onToolDone('get_stock_price', [{ date: '2026-04-14', close: 247.82 }], 820);
    const card = document.querySelector('[data-tool-name="get_stock_price"]');
    expect(card.classList.contains('done')).toBe(true);
  });

  test('onToolDone marks card as error on error result', () => {
    anim.onToolCards([{ name: 'get_stock_price', args: {} }]);
    anim.onToolDone('get_stock_price', { error: 'Network failed' }, 100);
    const card = document.querySelector('[data-tool-name="get_stock_price"]');
    expect(card.classList.contains('error')).toBe(true);
  });

  test('reset clears tool cards', () => {
    anim.onToolCards([{ name: 'get_stock_price', args: {} }]);
    anim.reset();
    expect(document.querySelector('.tool-cards').innerHTML).toBe('');
  });
});

// ── ReasoningChain ──────────────────────────────────────────────

describe('ReasoningChain', () => {
  let chain;

  beforeEach(() => {
    buildDOM();
    chain = new ReasoningChain();
  });

  test('addStep appends a list item', () => {
    chain.addStep({ type: 'llm_thinking', turn: 0 });
    expect(document.querySelectorAll('.step-item')).toHaveLength(1);
  });

  test('addStep shows correct icon for tool_done', () => {
    chain.addStep({ type: 'tool_done', name: 'get_stock_price', result: [], duration_ms: 800 });
    expect(document.querySelector('.step-icon').textContent).toBe('✅');
  });

  test('addStep shows error icon for error type', () => {
    chain.addStep({ type: 'error', message: 'Something failed' });
    expect(document.querySelector('.step-icon').textContent).toBe('❌');
  });

  test('reset clears all steps', () => {
    chain.addStep({ type: 'llm_thinking', turn: 0 });
    chain.addStep({ type: 'tool_calls', calls: [] });
    chain.reset();
    expect(document.querySelectorAll('.step-item')).toHaveLength(0);
    expect(chain.steps).toHaveLength(0);
  });

  test('multiple steps accumulate', () => {
    chain.addStep({ type: 'query_received', query: 'Analyse TSLA' });
    chain.addStep({ type: 'llm_thinking', turn: 0 });
    chain.addStep({ type: 'final_answer', text: 'Done.', turn: 2 });
    expect(document.querySelectorAll('.step-item')).toHaveLength(3);
  });
});
