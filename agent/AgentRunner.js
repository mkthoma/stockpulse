import { callGemini }             from './GeminiClient.js';
import { HistoryManager }          from './HistoryManager.js';
import { get_stock_price }         from './tools/get_stock_price.js';
import { search_news }             from './tools/search_news.js';
import { correlate_price_to_news } from './tools/correlate.js';
import { get_peer_tickers }        from './tools/get_peer_tickers.js';
import { get_market_context }      from './tools/get_market_context.js';
import { summarise_findings }      from './tools/summarise_findings.js';
// analyse_price_drivers is used internally by summarise_findings — not model-callable

const TOOL_IMPLEMENTATIONS = {
  get_stock_price,
  search_news,
  correlate_price_to_news,
  get_peer_tickers,
  get_market_context,
  summarise_findings
};

// Extended to 10 turns: the richer analysis pipeline (price + peers + news ×3 +
// market context + correlate + analyse) can legitimately use 6–8 tool calls.
const MAX_TURNS = 10;

// How many consecutive empty responses to tolerate before giving up.
const MAX_EMPTY_RETRIES = 2;

/**
 * Trim tool results before they enter conversation history.
 *
 * The LLM re-inlines whatever data it sees in the history when it constructs the
 * next function call's arguments.  Large arrays (full OHLCV, full news articles
 * with descriptions/URLs, full SPY/QQQ price series) can push the output token
 * count past maxOutputTokens, causing Gemini to return empty parts.
 *
 * We keep only the fields that the LLM needs for reasoning:
 *   get_stock_price            → {date, close}
 *   search_news                → {date, headline, source}
 *   correlate_price_to_news    → {date, close, change_pct, direction, news:[{headline,source,lag}]}
 *   get_market_context         → {status, summary, period_totals, spy/qqq as {date, change_pct}}
 *   summarise_findings         → passed through unchanged (already compact ~200 tokens)
 */
function trimForHistory(name, result) {
  if (!result || typeof result !== 'object') return result;

  if (name === 'get_stock_price') {
    const arr = Array.isArray(result) ? result : result.output;
    if (!Array.isArray(arr)) return result;
    return arr.map(d => ({ date: d.date, close: d.close }));
  }

  if (name === 'search_news') {
    const arr = Array.isArray(result) ? result : result.output;
    if (!Array.isArray(arr)) return result;
    return arr.slice(0, 10).map(a => ({
      date:     a.date,
      headline: a.headline,
      source:   a.source
    }));
  }

  if (name === 'correlate_price_to_news') {
    const arr = Array.isArray(result) ? result : null;
    if (!arr) return result;
    // Keep price fields + trimmed news (headline/source/lag only, max 3 per day)
    return arr.map(d => ({
      date:       d.date,
      close:      d.close,
      change_pct: d.change_pct,
      direction:  d.direction,
      news:       (d.news ?? []).slice(0, 3).map(a => ({
        headline: a.headline,
        source:   a.source,
        lag:      a.lag
      }))
    }));
  }

  if (name === 'get_market_context' && result.spy) {
    return {
      status:        result.status,
      summary:       result.summary,
      period_totals: result.period_totals,
      // Keep change_pct (not renamed) so downstream tools can still use the history
      spy: result.spy.map(d => ({ date: d.date, change_pct: d.change_pct })),
      qqq: result.qqq.map(d => ({ date: d.date, change_pct: d.change_pct }))
    };
  }

  if (name === 'summarise_findings') {
    // The tool already returns a compact shape — just pass it through unchanged.
    // findings_text + significant_events are all the model needs to write its answer.
    return result;
  }

  return result;
}

export async function runAgentLoop(userQuery, onStep) {
  const history = new HistoryManager();
  history.addUser(userQuery);

  onStep({ type: 'query_received', query: userQuery });

  // Session cache: store raw (untrimmed) results for tools that other tools depend on.
  // analyse_price_drivers needs the full correlate output and market context, but
  // requiring the LLM to re-emit those large objects as function-call arguments
  // exhausts its output budget.  We inject them automatically instead.
  const sessionCache = {
    correlate:     null,   // raw correlate_price_to_news output (array)
    marketContext: null    // raw get_market_context output
  };

  let emptyRetries = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    onStep({ type: 'llm_thinking', turn });

    const candidate = await callGemini(history.get());
    const parts = candidate.content?.parts ?? [];

    // Function calls take priority — a text preamble alongside tool calls is not a final answer
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length > 0) {
      emptyRetries = 0; // reset on successful response
      onStep({ type: 'tool_calls', calls: functionCalls.map(p => p.functionCall), turn });

      const toolResults = await Promise.all(
        functionCalls.map(async ({ functionCall: fc }) => {
          const impl = TOOL_IMPLEMENTATIONS[fc.name];
          if (!impl) throw new Error(`Unknown tool: ${fc.name}`);

          // For summarise_findings, inject cached timeline + market_context so the
          // model only needs to pass ticker (avoids re-emitting large JSON objects).
          // analyse_price_drivers is kept as an internal utility and is not model-callable.
          let args = fc.args;
          if (fc.name === 'summarise_findings') {
            args = { ...fc.args };
            if (!args.timeline && sessionCache.correlate) {
              args.timeline = sessionCache.correlate;
            }
            if (!args.market_context && sessionCache.marketContext) {
              args.market_context = sessionCache.marketContext;
            }
          }

          onStep({ type: 'tool_start', name: fc.name, args, turn });
          const start = Date.now();

          let result;
          try {
            result = await impl(args);
          } catch (err) {
            result = { error: err.message };
          }

          // Populate session cache with raw results
          if (fc.name === 'correlate_price_to_news' && !result?.error) {
            sessionCache.correlate = Array.isArray(result) ? result : null;
          }
          if (fc.name === 'get_market_context' && !result?.error) {
            sessionCache.marketContext = result;
          }

          const duration_ms = Date.now() - start;
          onStep({ type: 'tool_done', name: fc.name, result, duration_ms, turn });

          // Trim before storing in history to keep context window lean
          return { name: fc.name, response: trimForHistory(fc.name, result) };
        })
      );

      history.addModel(parts);
      history.addToolResults(toolResults);
      continue;
    }

    const textPart = parts.find(p => p.text);
    if (textPart) {
      emptyRetries = 0;
      onStep({ type: 'final_answer', text: textPart.text, turn });
      return textPart.text;
    }

    // Empty response — nudge the model instead of throwing immediately.
    // Do NOT add the empty model parts to history (an empty model turn is invalid);
    // instead append a user nudge so the next call has valid turn alternation.
    emptyRetries++;
    if (emptyRetries <= MAX_EMPTY_RETRIES) {
      history.addUser(
        'Please continue. Call analyse_price_drivers or write your final answer now.'
      );
      continue;
    }

    throw new Error('Agent stalled: Gemini returned no content after multiple retries.');
  }

  throw new Error(`Agent exceeded ${MAX_TURNS} turn limit without a final answer.`);
}
