export const TOOL_DEF = {
  name: 'get_stock_price',
  description: 'Fetch historical OHLCV price data for a stock ticker over a period. Returns an array of {date, open, high, low, close, volume} objects.',
  parameters: {
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock symbol e.g. TSLA, AAPL, NVDA' },
      period: { type: 'string', enum: ['1d', '7d', '30d', '90d'], description: 'Time range' }
    },
    required: ['ticker', 'period']
  }
};

export async function get_stock_price({ ticker, period }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=1d&corsDomain=finance.yahoo.com`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status} for ${ticker}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];

  if (!result) {
    throw new Error(`No price data found for ticker "${ticker}"`);
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];
  const opens  = quote.open  ?? [];
  const highs  = quote.high  ?? [];
  const lows   = quote.low   ?? [];
  const volumes= quote.volume?? [];

  return timestamps
    .map((ts, i) => ({
      date:   new Date(ts * 1000).toISOString().slice(0, 10),
      open:   opens[i]   != null ? Math.round(opens[i]   * 100) / 100 : null,
      high:   highs[i]   != null ? Math.round(highs[i]   * 100) / 100 : null,
      low:    lows[i]    != null ? Math.round(lows[i]    * 100) / 100 : null,
      close:  closes[i]  != null ? Math.round(closes[i]  * 100) / 100 : null,
      volume: volumes[i] ?? null
    }))
    .filter(d => d.close !== null);
}
