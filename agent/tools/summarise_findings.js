/**
 * summarise_findings
 *
 * A lightweight "compression" step that sits between correlate_price_to_news
 * and the model's final answer.
 *
 * The model only passes `ticker`.  AgentRunner injects the cached correlate
 * timeline and market_context automatically — so no large JSON objects ever
 * need to be re-emitted as function-call arguments.
 *
 * Returns a compact JSON (≈150–300 tokens) with:
 *   • period_return_pct / market_return_pct / outperformance
 *   • up to 5 significant_events, each with:
 *       date, stock_change_pct, relative_vs_spy, driver_type, driver_detail,
 *       top_headlines (max 2 per day)
 *   • a plain-English findings_text string the model can quote directly
 *
 * The full driver-classification logic (keyword matching, peer-drag detection,
 * market-move thresholds) is performed here rather than asking the model to
 * re-run it mentally.
 */

import { analyse_price_drivers } from './analyse_price_drivers.js';

export const TOOL_DEF = {
  name: 'summarise_findings',
  description:
    'Compress the correlated price+news data into a compact, token-efficient analysis. ' +
    'Identifies the most significant trading days, classifies the driver of each move ' +
    '(earnings, macro, analyst_action, market_move, unexplained, etc.), and returns a ' +
    'short findings summary ready to include in the final answer. ' +
    'The timeline and market context are injected automatically — only pass ticker. ' +
    'Call this immediately after correlate_price_to_news.',
  parameters: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'The primary stock ticker (e.g. "NVDA")'
      },
      significance_threshold: {
        type: 'number',
        description: 'Minimum absolute % move to flag as significant. Default 1.5'
      }
    },
    required: ['ticker']
  }
};

/**
 * @param {object} params
 * @param {string}  params.ticker
 * @param {Array}   params.timeline          - injected by AgentRunner from session cache
 * @param {object}  params.market_context    - injected by AgentRunner from session cache
 * @param {number}  [params.significance_threshold]
 */
export function summarise_findings({
  ticker,
  timeline,
  market_context,
  significance_threshold = 1.5
}) {
  if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
    return {
      status:  'warning',
      summary: `No correlated timeline available for ${ticker}. Call correlate_price_to_news first.`,
      ticker
    };
  }

  if (!market_context) {
    return {
      status:  'warning',
      summary: `No market context available for ${ticker}. Call get_market_context first.`,
      ticker
    };
  }

  // Run full driver analysis (this is a pure JS function — no API call, instant)
  const analysis = analyse_price_drivers({
    ticker,
    timeline,
    market_context,
    significance_threshold
  });

  const spy    = analysis.market_period_return?.spy ?? null;
  const outper = spy !== null
    ? parseFloat((analysis.period_return_pct - spy).toFixed(2))
    : null;

  // Trim each significant event down to the essential fields only
  const compactEvents = (analysis.significant_events ?? []).slice(0, 5).map(ev => ({
    date:            ev.date,
    stock_chg_pct:   ev.stock_change_pct,
    relative_vs_spy: ev.relative_vs_spy,
    direction:       ev.direction,
    driver_type:     ev.driver_type,
    driver_detail:   ev.driver_detail,
    // Keep only the top 2 headlines so history stays small
    top_headlines:   (ev.company_news ?? [])
      .slice(0, 2)
      .map(n => `${n.headline} (${n.source})`)
  }));

  // Build a short plain-English findings text the model can reference directly
  const sign = (n) => n >= 0 ? '+' : '';
  const stockStr  = `${sign(analysis.period_return_pct)}${analysis.period_return_pct}%`;
  const marketStr = spy !== null ? ` vs SPY ${sign(spy)}${spy}%` : '';
  const outStr    = outper !== null
    ? ` (${sign(outper)}${outper}% relative to market)`
    : '';

  const eventLines = compactEvents.map(ev => {
    const rel = ev.relative_vs_spy !== null ? ` / ${sign(ev.relative_vs_spy)}${ev.relative_vs_spy}% vs SPY` : '';
    const news = ev.top_headlines.length > 0 ? ` — "${ev.top_headlines[0]}"` : '';
    return `  • ${ev.date}: ${sign(ev.stock_chg_pct)}${ev.stock_chg_pct}%${rel} | ${ev.driver_type}${news}`;
  }).join('\n');

  const noEventNote = compactEvents.length === 0
    ? `  • No single-day moves exceeded ${significance_threshold}% — trend was gradual.`
    : '';

  const findings_text =
    `${ticker} returned ${stockStr} over the period${marketStr}${outStr}.\n` +
    `Significant events (${compactEvents.length}):\n` +
    (eventLines || noEventNote);

  return {
    status:              'success',
    ticker,
    period_return_pct:   analysis.period_return_pct,
    market_return_pct:   spy,
    outperformance_pct:  outper,
    significant_events:  compactEvents,
    findings_text,
    next_step:
      'Write the final answer using findings_text and significant_events. ' +
      'Include peer context and market comparison in ## Peer & Sector Context.'
  };
}
