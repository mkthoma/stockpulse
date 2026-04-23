export const TOOL_DEF = {
  name: 'get_peer_tickers',
  description:
    'Get peer and competitor tickers for a stock using Yahoo Finance recommendations. ' +
    'Call this early in the analysis so you can fetch peer news and prices in parallel. ' +
    'Returns up to 5 peer symbols ranked by relevance score.',
  parameters: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Stock symbol to find peers for, e.g. TSLA, AAPL, NVDA'
      }
    },
    required: ['ticker']
  }
};

const PEER_ENDPOINTS = [
  ticker => `https://query2.finance.yahoo.com/v6/finance/recommendationsbyticker/${encodeURIComponent(ticker)}`,
  ticker => `https://query1.finance.yahoo.com/v6/finance/recommendationsbyticker/${encodeURIComponent(ticker)}`
];

export async function get_peer_tickers({ ticker }) {
  const sym = ticker.toUpperCase();

  for (const buildUrl of PEER_ENDPOINTS) {
    let res;
    try {
      res = await fetch(buildUrl(sym), {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
      });
    } catch {
      continue; // network error — try next endpoint
    }

    if (!res.ok) continue; // 4xx/5xx — try next endpoint

    let data;
    try { data = await res.json(); } catch { continue; }

    const recommended = data?.finance?.result?.[0]?.recommendedSymbols ?? [];
    if (recommended.length === 0) break; // got a response but no data — stop trying

    const peers = recommended.slice(0, 5).map(s => ({
      ticker: s.symbol,
      relevance_score: typeof s.score === 'number' ? parseFloat(s.score.toFixed(3)) : null
    }));

    return {
      status: 'success',
      summary: `Found ${peers.length} peers for ${sym}: ${peers.map(p => p.ticker).join(', ')}`,
      ticker: sym,
      peers
    };
  }

  // All endpoints failed — return graceful warning so the agent continues without peers
  return {
    status: 'warning',
    summary: `Peer data unavailable for ${sym} — continuing without peer comparison`,
    ticker: sym,
    peers: []
  };
}
