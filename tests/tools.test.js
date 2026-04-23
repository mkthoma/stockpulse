/**
 * Unit tests for the 3 StockPulse tool functions.
 * Run with: npx jest tests/tools.test.js
 */

// ── correlate_price_to_news (pure JS, no mocks needed) ─────────

import { correlate_price_to_news } from '../agent/tools/correlate.js';

describe('correlate_price_to_news', () => {
  const prices = [
    { date: '2026-04-14', close: 247.82 },
    { date: '2026-04-15', close: 255.60 },
    { date: '2026-04-16', close: 249.10 }
  ];

  const news = [
    { date: '2026-04-14', headline: 'Tesla Q1 earnings miss', source: 'Reuters' },
    { date: '2026-04-14', headline: 'Tesla deliveries decline', source: 'Bloomberg' },
    { date: '2026-04-16', headline: 'Musk tweets on DOGE', source: 'CNBC' }
  ];

  test('returns one entry per price day', () => {
    const result = correlate_price_to_news({ prices, news_articles: news });
    expect(result).toHaveLength(3);
  });

  test('first day change_pct is 0 (no previous)', () => {
    const result = correlate_price_to_news({ prices, news_articles: news });
    expect(result[0].change_pct).toBe(0);
  });

  test('computes correct change_pct for day 2', () => {
    const result = correlate_price_to_news({ prices, news_articles: news });
    const expected = parseFloat(((255.60 - 247.82) / 247.82 * 100).toFixed(2));
    expect(result[1].change_pct).toBe(expected);
    expect(result[1].direction).toBe('Up');
  });

  test('attaches news articles to the matching date', () => {
    const result = correlate_price_to_news({ prices, news_articles: news });
    expect(result[0].news).toHaveLength(2);
    expect(result[0].news[0].headline).toBe('Tesla Q1 earnings miss');
  });

  test('days with no news have empty array', () => {
    const result = correlate_price_to_news({ prices, news_articles: news });
    expect(result[1].news).toHaveLength(0);
  });

  test('direction is Down when price falls', () => {
    const result = correlate_price_to_news({ prices, news_articles: news });
    expect(result[2].direction).toBe('Down');
    expect(result[2].change_pct).toBeLessThan(0);
  });

  test('handles empty news array', () => {
    const result = correlate_price_to_news({ prices, news_articles: [] });
    expect(result.every(d => d.news.length === 0)).toBe(true);
  });

  test('handles empty prices array', () => {
    const result = correlate_price_to_news({ prices: [], news_articles: news });
    expect(result).toHaveLength(0);
  });
});

// ── get_stock_price (fetch mock) ────────────────────────────────

import { get_stock_price } from '../agent/tools/get_stock_price.js';

const MOCK_YAHOO_RESPONSE = {
  chart: {
    result: [{
      timestamp: [1713052800, 1713139200],
      indicators: {
        quote: [{
          open:   [245.0, 248.0],
          high:   [250.0, 260.0],
          low:    [244.0, 247.0],
          close:  [247.82, 255.60],
          volume: [120000000, 98000000]
        }]
      }
    }]
  }
};

describe('get_stock_price', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_YAHOO_RESPONSE)
    });
  });

  test('returns array of price objects', async () => {
    const result = await get_stock_price({ ticker: 'TSLA', period: '7d' });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('each record has date and close', async () => {
    const result = await get_stock_price({ ticker: 'TSLA', period: '7d' });
    expect(result[0]).toMatchObject({ date: expect.any(String), close: expect.any(Number) });
  });

  test('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(get_stock_price({ ticker: 'INVALID', period: '7d' })).rejects.toThrow('404');
  });

  test('throws when chart result is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ chart: { result: null } })
    });
    await expect(get_stock_price({ ticker: 'TSLA', period: '7d' })).rejects.toThrow();
  });
});

// ── search_news (fetch mock + chrome.storage mock) ──────────────

import { search_news } from '../agent/tools/search_news.js';

const MOCK_NEWS_RESPONSE = {
  status: 'ok',
  articles: [
    {
      publishedAt: '2026-04-14T10:00:00Z',
      title: 'Tesla Q1 earnings miss estimates',
      source: { name: 'Reuters' },
      description: 'Tesla reported lower than expected earnings.',
      url: 'https://reuters.com/tesla'
    }
  ]
};

describe('search_news', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({ newsApiKey: 'test-key-12345' })
        }
      }
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_NEWS_RESPONSE)
    });
  });

  test('returns array of article objects', async () => {
    const result = await search_news({ query: 'Tesla', from_date: '2026-04-14' });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  test('article has expected fields', async () => {
    const [article] = await search_news({ query: 'Tesla', from_date: '2026-04-14' });
    expect(article).toMatchObject({
      date:        '2026-04-14',
      headline:    expect.any(String),
      source:      'Reuters',
      description: expect.any(String)
    });
  });

  test('throws when no API key stored', async () => {
    global.chrome.storage.local.get = jest.fn().mockResolvedValue({});
    await expect(search_news({ query: 'Tesla', from_date: '2026-04-14' })).rejects.toThrow('NewsAPI key');
  });

  test('throws on non-ok HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve('Rate limited') });
    await expect(search_news({ query: 'Tesla', from_date: '2026-04-14' })).rejects.toThrow('429');
  });
});
