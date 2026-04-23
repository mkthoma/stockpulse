import { get_stock_price } from './get_stock_price.js';

export const TOOL_DEF = {
  name: 'get_market_context',
  description:
    'Fetch broad market (SPY = S&P 500) and tech index (QQQ = Nasdaq 100) daily price data ' +
    'for the same period as the stock being analysed. Use this to separate stock-specific moves ' +
    'from market-wide events. A stock that dropped 4% on a day the S&P dropped 3% is only -1% ' +
    'on a relative basis — very different story from dropping 4% while the market was flat.',
  parameters: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['1d', '7d', '30d', '90d'],
        description: 'Time range — must match the period used for get_stock_price'
      }
    },
    required: ['period']
  }
};

function addChangePct(prices) {
  return prices.map((day, i) => {
    const prev = i > 0 ? prices[i - 1].close : day.close;
    const pct  = prev !== 0
      ? parseFloat(((day.close - prev) / prev * 100).toFixed(2))
      : 0;
    return { date: day.date, close: day.close, change_pct: pct };
  });
}

export async function get_market_context({ period }) {
  const [spyRaw, qqqRaw] = await Promise.all([
    get_stock_price({ ticker: 'SPY', period }),
    get_stock_price({ ticker: 'QQQ', period })
  ]);

  const spy = addChangePct(spyRaw);
  const qqq = addChangePct(qqqRaw);

  // Compute period totals for the summary
  const spyTotal = spy.length > 1
    ? parseFloat(((spy.at(-1).close - spy[0].close) / spy[0].close * 100).toFixed(2))
    : 0;
  const qqqTotal = qqq.length > 1
    ? parseFloat(((qqq.at(-1).close - qqq[0].close) / qqq[0].close * 100).toFixed(2))
    : 0;

  return {
    status: 'success',
    summary:
      `Market over period — SPY ${spyTotal >= 0 ? '+' : ''}${spyTotal}%  ` +
      `QQQ ${qqqTotal >= 0 ? '+' : ''}${qqqTotal}%`,
    spy,
    qqq,
    period_totals: { spy: spyTotal, qqq: qqqTotal }
  };
}
