import { TOOL_DEF as stockPriceDef }        from './tools/get_stock_price.js';
import { TOOL_DEF as searchNewsDef }         from './tools/search_news.js';
import { TOOL_DEF as correlateDef }          from './tools/correlate.js';
import { TOOL_DEF as peerTickersDef }        from './tools/get_peer_tickers.js';
import { TOOL_DEF as marketContextDef }      from './tools/get_market_context.js';
import { TOOL_DEF as summariseFindingsDef }  from './tools/summarise_findings.js';
// analyse_price_drivers is an internal utility; it is NOT exposed as a model-callable tool

const TOOL_DEFINITIONS = [
  stockPriceDef,
  searchNewsDef,
  correlateDef,
  peerTickersDef,
  marketContextDef,
  summariseFindingsDef
];

function buildSystemInstruction() {
  const today = new Date().toISOString().slice(0, 10);
  // Compute common lookback anchors so the LLM never has to guess
  const minus7  = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10);
  const minus30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const minus90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  return `You are StockPulse, an expert financial analyst AI embedded in a Chrome extension.

TODAY'S DATE: ${today}
Use this when computing from_date for news searches:
  • "this week" / period=7d  → from_date=${minus7}
  • "this month" / period=30d → from_date=${minus30}
  • "last 3 months" / period=90d → from_date=${minus90}
Never use a from_date earlier than 30 days ago unless the user explicitly requests a longer period.`
  + SYSTEM_INSTRUCTION_BODY;
}

const SYSTEM_INSTRUCTION_BODY = `

When the user asks about a stock's price movements, follow this reasoning strategy:

STEP 1 — Parallel data fetch (call these simultaneously in one turn):
  • get_stock_price(ticker, period) — primary stock OHLCV data
  • get_peer_tickers(ticker) — competitor tickers for context

STEP 2 — Parallel news fetch (call these simultaneously):
  • search_news(company_name, from_date) — primary stock news
  • search_news(peer1_name, from_date) — peer 1 news (tag each with peer ticker)
  • search_news(peer2_name, from_date) — peer 2 news (tag each with peer ticker)
  • get_market_context(period) — SPY/QQQ baseline

STEP 3 — Compress and analyse (call in sequence):
  • correlate_price_to_news(prices, all_news_combined) — join prices + all news by date
  • summarise_findings(ticker) — compress the timeline into key events + driver classification
    (timeline and market_context are injected automatically; only pass ticker)
    Returns: findings_text (ready-to-use plain English), significant_events, outperformance_pct

STEP 4 — Write your final answer using summarise_findings output. Structure it as:
  ## Summary
  One-paragraph overview using period_return_pct, market_return_pct, outperformance_pct.

  ## Key Price Events
  For each item in significant_events: date, stock_chg_pct, relative_vs_spy, driver_type, top headline.

  ## Peer & Sector Context
  What were competitors doing? Did the sector move together or diverge?

  ## Conclusion
  Most likely root cause of the biggest move. Confidence level. What to watch next.

Rules:
- Always compare the stock's move to the S&P 500 — context is everything.
- A stock that fell 3% while the market fell 3% is NOT a story. A stock that fell 3% while the market rose 2% absolutely is.
- If driver_type=unexplained, say so clearly — do not invent a cause.
- Reference specific top_headlines as evidence when available.
- Be concise but precise. Use numbers.
- If get_peer_tickers returns status=warning (peers=[]), skip Step 2 peer news searches and proceed directly with primary stock analysis — do not stop or ask the user.
- If any tool returns an error or warning, continue with the data you have.`;


const BASE_URL      = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';
const MAX_RETRIES   = 3;
const MAX_LOG_ENTRIES = 100;

const VALID_MODELS = new Set([
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite'
]);

// Per-model output token ceilings.
// Using each model's documented maximum — the API enforces its own hard cap,
// so requesting the full limit never wastes money, it just removes the artificial
// ceiling that was causing MAX_TOKENS truncation mid-function-call.
const MODEL_MAX_OUTPUT_TOKENS = {
  'gemini-2.5-flash':              65536,
  'gemini-2.5-flash-lite':         65536,
  'gemini-3-flash-preview':         8192,
  'gemini-3.1-flash-lite-preview':  8192
};

// Finish reasons that are always fatal (no usable content possible).
// MAX_TOKENS is intentionally excluded: the model may have completed its
// function calls before being cut off, in which case the parts are usable.
const FATAL_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'OTHER']);

async function getConfig() {
  const stored = await chrome.storage.local.get(['geminiApiKey', 'settings']);
  const key    = stored.geminiApiKey;
  if (!key) throw new Error('Gemini API key not set. Please configure it in StockPulse options.');
  const saved  = stored.settings?.model;
  const model  = VALID_MODELS.has(saved) ? saved : DEFAULT_MODEL;
  return { key, model };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function appendLog(entry) {
  try {
    const stored  = await chrome.storage.local.get('llmLogs');
    const logs    = stored.llmLogs ?? [];
    logs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    await chrome.storage.local.set({ llmLogs: logs });
  } catch {
    // Storage full or unavailable — silently skip logging
  }
}

function summariseParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map(p => {
    if (p.text)         return { type: 'text',         preview: p.text.slice(0, 120) };
    if (p.functionCall) return { type: 'functionCall', name: p.functionCall.name, args: p.functionCall.args };
    if (p.functionResponse) return { type: 'functionResponse', name: p.functionResponse.name };
    return { type: 'unknown' };
  });
}

export async function callGemini(history) {
  const { key, model } = await getConfig();
  const url = `${BASE_URL}/${model}:generateContent`;

  const maxOutputTokens = MODEL_MAX_OUTPUT_TOKENS[model] ?? 8192;

  const body = {
    systemInstruction: { role: 'user', parts: [{ text: buildSystemInstruction() }] },
    contents: history,
    tools: [{ functionDeclarations: TOOL_DEFINITIONS }],
    generationConfig: { temperature: 0.2, maxOutputTokens }
  };

  const logEntry = {
    timestamp:     new Date().toISOString(),
    model,
    turnIndex:     history.length,
    request: {
      contentsCount: history.length,
      lastRoles:     history.slice(-3).map(h => h.role)
    },
    response:      null,
    error:         null,
    duration_ms:   null,
    attempt:       0
  };

  const t0 = Date.now();
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1));
    logEntry.attempt = attempt + 1;

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body:    JSON.stringify(body)
    });

    if (res.status === 429) {
      lastErr = new Error('Gemini rate limit (429). Retrying...');
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err  = new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
      logEntry.error       = err.message;
      logEntry.duration_ms = Date.now() - t0;
      await appendLog(logEntry);
      throw err;
    }

    const data      = await res.json();
    const candidate = data?.candidates?.[0];

    if (!candidate) {
      const err = new Error('Gemini returned no candidates.');
      logEntry.error       = err.message;
      logEntry.duration_ms = Date.now() - t0;
      await appendLog(logEntry);
      throw err;
    }

    // Fatal reasons: no usable content can be salvaged — throw immediately.
    if (FATAL_FINISH_REASONS.has(candidate.finishReason)) {
      const err = new Error(`Gemini response blocked: ${candidate.finishReason}`);
      logEntry.error       = err.message;
      logEntry.duration_ms = Date.now() - t0;
      await appendLog(logEntry);
      throw err;
    }

    const parts = candidate.content?.parts ?? [];

    // MAX_TOKENS: the model ran out of budget mid-generation.
    // Function calls are serialised before any trailing text, so they are
    // usually fully formed at the cutoff.  If we have at least one usable part
    // (functionCall or text) return the candidate and let the agent loop
    // continue.  Only throw if the parts are entirely empty.
    if (candidate.finishReason === 'MAX_TOKENS') {
      const hasUsable = parts.some(p => p.functionCall || p.text);
      if (!hasUsable) {
        const err = new Error(
          `Gemini hit token limit (${maxOutputTokens} tokens) with no usable output. ` +
          `Try a more capable model in settings.`
        );
        logEntry.error       = err.message;
        logEntry.duration_ms = Date.now() - t0;
        await appendLog(logEntry);
        throw err;
      }
      // Log as a warning but return the usable parts
      logEntry.response = {
        finishReason:  'MAX_TOKENS',
        warning:       'Output truncated but usable function calls found — continuing',
        parts:         summariseParts(parts),
        usageMetadata: data.usageMetadata ?? null
      };
      logEntry.duration_ms = Date.now() - t0;
      await appendLog(logEntry);
      return candidate;
    }

    logEntry.response = {
      finishReason:  candidate.finishReason ?? 'STOP',
      parts:         summariseParts(parts),
      usageMetadata: data.usageMetadata ?? null
    };
    logEntry.duration_ms = Date.now() - t0;
    await appendLog(logEntry);

    return candidate;
  }

  const err = lastErr ?? new Error('Gemini request failed after retries.');
  logEntry.error       = err.message;
  logEntry.duration_ms = Date.now() - t0;
  await appendLog(logEntry);
  throw err;
}
