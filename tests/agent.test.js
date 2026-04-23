/**
 * Unit tests for AgentRunner — mocks Gemini and all tools.
 * Run with: npx jest tests/agent.test.js
 */

import { runAgentLoop } from '../agent/AgentRunner.js';

// Mock modules
jest.mock('../agent/GeminiClient.js');
jest.mock('../agent/tools/get_stock_price.js');
jest.mock('../agent/tools/search_news.js');
jest.mock('../agent/tools/correlate.js');

import { callGemini }             from '../agent/GeminiClient.js';
import { get_stock_price }        from '../agent/tools/get_stock_price.js';
import { search_news }            from '../agent/tools/search_news.js';
import { correlate_price_to_news} from '../agent/tools/correlate.js';

const MOCK_PRICES = [{ date: '2026-04-14', close: 247.82 }];
const MOCK_NEWS   = [{ date: '2026-04-14', headline: 'Tesla news', source: 'Reuters' }];
const MOCK_CORR   = [{ date: '2026-04-14', close: 247.82, change_pct: 0, direction: 'Flat', news: [] }];

describe('runAgentLoop', () => {
  let steps;

  beforeEach(() => {
    steps = [];
    get_stock_price.mockResolvedValue(MOCK_PRICES);
    search_news.mockResolvedValue(MOCK_NEWS);
    correlate_price_to_news.mockReturnValue(MOCK_CORR);
  });

  test('completes 3-turn loop and returns text', async () => {
    // Turn 1: two parallel function calls
    callGemini
      .mockResolvedValueOnce({
        content: { parts: [
          { functionCall: { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } } },
          { functionCall: { name: 'search_news',     args: { query: 'Tesla', from_date: '2026-04-13' } } }
        ]}
      })
      // Turn 2: correlation
      .mockResolvedValueOnce({
        content: { parts: [
          { functionCall: { name: 'correlate_price_to_news', args: { prices: MOCK_PRICES, news_articles: MOCK_NEWS } } }
        ]}
      })
      // Turn 3: final text answer
      .mockResolvedValueOnce({
        content: { parts: [{ text: 'Tesla dropped this week due to earnings miss.' }] }
      });

    const answer = await runAgentLoop('Analyse Tesla', s => steps.push(s));

    expect(answer).toBe('Tesla dropped this week due to earnings miss.');
    expect(callGemini).toHaveBeenCalledTimes(3);
  });

  test('emits correct step event sequence', async () => {
    callGemini
      .mockResolvedValueOnce({
        content: { parts: [
          { functionCall: { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } } }
        ]}
      })
      .mockResolvedValueOnce({
        content: { parts: [{ text: 'Final answer.' }] }
      });

    await runAgentLoop('Analyse Tesla', s => steps.push(s));

    const types = steps.map(s => s.type);
    expect(types).toContain('query_received');
    expect(types).toContain('llm_thinking');
    expect(types).toContain('tool_calls');
    expect(types).toContain('tool_start');
    expect(types).toContain('tool_done');
    expect(types).toContain('final_answer');
  });

  test('emits error step when tool throws', async () => {
    get_stock_price.mockRejectedValue(new Error('Yahoo Finance unavailable'));

    callGemini.mockResolvedValue({
      content: { parts: [
        { functionCall: { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } } }
      ]}
    });

    // Will loop until MAX_TURNS — provide final answer at turn 2
    callGemini
      .mockResolvedValueOnce({
        content: { parts: [
          { functionCall: { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } } }
        ]}
      })
      .mockResolvedValueOnce({
        content: { parts: [{ text: 'Could not fetch prices.' }] }
      });

    await runAgentLoop('Analyse TSLA', s => steps.push(s));

    const doneDone = steps.find(s => s.type === 'tool_done' && s.name === 'get_stock_price');
    expect(doneDone.result.error).toMatch('Yahoo Finance unavailable');
  });

  test('throws after MAX_TURNS without answer', async () => {
    callGemini.mockResolvedValue({
      content: { parts: [
        { functionCall: { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } } }
      ]}
    });

    await expect(
      runAgentLoop('Infinite loop test', () => {})
    ).rejects.toThrow('turn limit');
  });

  test('executes parallel tool calls with Promise.all', async () => {
    const callOrder = [];
    get_stock_price.mockImplementation(async () => { callOrder.push('price'); return MOCK_PRICES; });
    search_news.mockImplementation(async ()     => { callOrder.push('news');  return MOCK_NEWS; });

    callGemini
      .mockResolvedValueOnce({
        content: { parts: [
          { functionCall: { name: 'get_stock_price', args: { ticker: 'TSLA', period: '7d' } } },
          { functionCall: { name: 'search_news',     args: { query: 'Tesla', from_date: '2026-04-13' } } }
        ]}
      })
      .mockResolvedValueOnce({
        content: { parts: [{ text: 'Done.' }] }
      });

    await runAgentLoop('Parallel test', () => {});
    expect(get_stock_price).toHaveBeenCalledTimes(1);
    expect(search_news).toHaveBeenCalledTimes(1);
  });
});
