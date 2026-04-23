export const TOOL_DEF = {
  name: 'analyse_price_drivers',
  description:
    'Analyse the correlated price+news timeline against market context to determine WHY a stock ' +
    'moved on each significant day. Computes relative performance vs the S&P 500, classifies ' +
    'each significant day into a driver type (earnings, analyst_action, corporate_event, ' +
    'risk_event, product_event, macro, market_move, peer_drag, news_driven, unexplained), ' +
    'and returns the top significant events ranked by magnitude. ' +
    'Call this after correlate_price_to_news and get_market_context. ' +
    'The timeline and market_context are injected automatically — only ticker is required.',
  parameters: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'The primary stock ticker being analysed (e.g. "NVDA")'
      },
      peer_news: {
        type: 'array',
        description:
          'Optional — flat list of news articles from peer company searches. ' +
          'Include these so the analysis can flag peer-driven moves. ' +
          'Each item: {ticker, date, headline, source}',
        items: { type: 'object' }
      },
      significance_threshold: {
        type: 'number',
        description:
          'Minimum absolute change_pct to flag as significant. Default 1.5 ' +
          '(i.e. flag days where stock moved ±1.5% or more)'
      }
    },
    required: ['ticker']
  }
};

// Keyword → driver_type mappings (checked in priority order)
const DRIVER_PATTERNS = [
  {
    type: 'earnings',
    detail: 'Earnings / financial results announcement',
    re: /earnings|revenue|profit|loss|eps|guidance|beat|miss|quarterly results|fiscal|q[1-4] 20/
  },
  {
    type: 'analyst_action',
    detail: 'Analyst rating or price target change',
    re: /upgrade|downgrade|outperform|underperform|price target|analyst|initiat|buy rating|sell rating|neutral|overweight|underweight/
  },
  {
    type: 'corporate_event',
    detail: 'Merger, acquisition, or major corporate action',
    re: /acqui|merger|deal|takeover|buyout|partnership|joint venture|spin.?off|divestiture|ipo/
  },
  {
    type: 'risk_event',
    detail: 'Legal, regulatory, or product safety event',
    re: /recall|lawsuit|sec|investigation|probe|fine|penalty|safety|class action|doj|ftc|antitrust|sanction/
  },
  {
    type: 'product_event',
    detail: 'Product launch, keynote, or major announcement',
    re: /launch|new product|unveil|announce|release|keynote|event|demo|reveal|innovation/
  },
  {
    type: 'macro',
    detail: 'Macroeconomic event or policy change',
    re: /interest rate|fed |inflation|gdp|unemployment|jobs report|tariff|trade war|geopolitic|recession|policy|central bank/
  }
];

function classifyDriver(stockChangePct, relativeMove, newsForDay, peerNewsForDay, spyChangePct) {
  const allText = [
    ...newsForDay.map(n => (n.headline ?? '') + ' ' + (n.description ?? '')),
    ...peerNewsForDay.map(n => (n.headline ?? '') + ' ' + (n.description ?? ''))
  ].join(' ').toLowerCase();

  const absRelative = relativeMove !== null ? Math.abs(relativeMove) : Infinity;

  // Moved almost entirely with the market — not a stock-specific event
  if (relativeMove !== null && absRelative < 0.8) {
    return {
      type: 'market_move',
      detail: `Moved with broad market (SPY ${spyChangePct >= 0 ? '+' : ''}${spyChangePct}% that day)`
    };
  }

  // Peer drag: peer news present but no primary stock news
  if (peerNewsForDay.length > 0 && newsForDay.length === 0) {
    const peerTicker = peerNewsForDay[0].ticker ?? 'peer';
    return {
      type: 'peer_drag',
      detail: `Likely moved due to ${peerTicker} news — no direct company news found`
    };
  }

  // Keyword-based classification against all headlines
  for (const { type, detail, re } of DRIVER_PATTERNS) {
    if (re.test(allText)) return { type, detail };
  }

  if (newsForDay.length > 0) {
    return { type: 'news_driven', detail: 'News-driven move — review headlines for specific catalyst' };
  }

  return {
    type: 'unexplained',
    detail: 'Significant move with no news found — possible pre-market catalyst, options activity, or short squeeze'
  };
}

export function analyse_price_drivers({
  ticker,
  timeline,
  market_context,
  peer_news = [],
  significance_threshold = 1.5
}) {
  // Build date-indexed lookups for market data
  const spyMap = {};
  const qqqMap = {};
  for (const d of (market_context.spy ?? [])) spyMap[d.date] = d.change_pct;
  for (const d of (market_context.qqq ?? [])) qqqMap[d.date] = d.change_pct;

  // Build date-indexed peer news lookup
  const peerNewsMap = {};
  for (const a of peer_news) {
    if (!peerNewsMap[a.date]) peerNewsMap[a.date] = [];
    peerNewsMap[a.date].push(a);
  }

  // Compute period return for the stock
  const validDays = timeline.filter(d => d.close !== null);
  const periodReturn = validDays.length > 1
    ? parseFloat(((validDays.at(-1).close - validDays[0].close) / validDays[0].close * 100).toFixed(2))
    : 0;

  const annotated = timeline.map(day => {
    const stockChg  = day.change_pct ?? 0;
    const spyChg    = spyMap[day.date] ?? null;
    const qqqChg    = qqqMap[day.date] ?? null;
    const relVsSpy  = spyChg !== null
      ? parseFloat((stockChg - spyChg).toFixed(2))
      : null;
    const relVsQqq  = qqqChg !== null
      ? parseFloat((stockChg - qqqChg).toFixed(2))
      : null;

    const newsForDay    = day.news ?? [];
    const peerNewsForDay = peerNewsMap[day.date] ?? [];
    const isSignificant = Math.abs(stockChg) >= significance_threshold;

    let driver = { type: 'normal', detail: 'Routine trading day' };
    if (isSignificant) {
      driver = classifyDriver(stockChg, relVsSpy, newsForDay, peerNewsForDay, spyChg);
    }

    return {
      date:                   day.date,
      close:                  day.close,
      stock_change_pct:       stockChg,
      spy_change_pct:         spyChg,
      qqq_change_pct:         qqqChg,
      relative_vs_spy:        relVsSpy,
      relative_vs_qqq:        relVsQqq,
      direction:              day.direction,
      is_significant:         isSignificant,
      driver_type:            driver.type,
      driver_detail:          driver.detail,
      company_news:           newsForDay,
      peer_news_that_day:     peerNewsForDay
    };
  });

  // Rank significant events by absolute relative move (most stock-specific first)
  const significantEvents = annotated
    .filter(d => d.is_significant)
    .sort((a, b) => {
      const aScore = Math.abs(a.relative_vs_spy ?? a.stock_change_pct);
      const bScore = Math.abs(b.relative_vs_spy ?? b.stock_change_pct);
      return bScore - aScore;
    })
    .slice(0, 8);

  return {
    status:  'success',
    summary: `${ticker} ${periodReturn >= 0 ? '+' : ''}${periodReturn}% over period. ` +
             `${significantEvents.length} significant events identified. ` +
             `Market (SPY): ${(market_context.period_totals?.spy ?? 0) >= 0 ? '+' : ''}${market_context.period_totals?.spy ?? 'N/A'}%`,
    ticker,
    period_return_pct:  periodReturn,
    market_period_return: market_context.period_totals ?? null,
    significant_events: significantEvents,
    full_timeline:      annotated,
    next_actions: [
      'Use significant_events to narrate the key price moves in your final answer',
      'For driver_type=unexplained, note that no news was found and speculate based on context',
      'Compare period_return_pct vs market_period_return to frame outperformance/underperformance'
    ]
  };
}
