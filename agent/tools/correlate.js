export const TOOL_DEF = {
  name: 'correlate_price_to_news',
  description:
    'Join price data with news articles by date. Returns an annotated timeline where each ' +
    'trading day shows price change % and any news published that day or the prior evening ' +
    '(overnight news often moves the next morning open). Pass all company news articles here — ' +
    'peer news should be included too if you have it. Then call analyse_price_drivers for causal classification.',
  parameters: {
    type: 'object',
    properties: {
      prices: {
        type: 'array',
        description: 'Array of {date, close} from get_stock_price',
        items: {
          type: 'object',
          properties: {
            date:  { type: 'string', description: 'ISO date YYYY-MM-DD' },
            close: { type: 'number', description: 'Closing price' }
          },
          required: ['date', 'close']
        }
      },
      news_articles: {
        type: 'array',
        description:
          'Array of {date, headline, source} from search_news. Include both primary stock ' +
          'news and peer/sector news for richer correlation.',
        items: {
          type: 'object',
          properties: {
            date:        { type: 'string', description: 'ISO date YYYY-MM-DD' },
            headline:    { type: 'string', description: 'Article headline' },
            source:      { type: 'string', description: 'News source name' },
            description: { type: 'string', description: 'Article description (optional)' }
          },
          required: ['date', 'headline', 'source']
        }
      }
    },
    required: ['prices', 'news_articles']
  }
};

// Advance a date string by N days
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function correlate_price_to_news({ prices, news_articles }) {
  // Build same-day map
  const newsMap = {};
  for (const article of news_articles) {
    if (!newsMap[article.date]) newsMap[article.date] = [];
    newsMap[article.date].push({ ...article, lag: 'same_day' });
  }

  // Also index news by "next trading day" — overnight news shifts the next morning
  const nextDayMap = {};
  for (const article of news_articles) {
    const nextDay = shiftDate(article.date, 1);
    if (!nextDayMap[nextDay]) nextDayMap[nextDay] = [];
    nextDayMap[nextDay].push({ ...article, lag: 'prior_evening' });
  }

  return prices.map((day, i) => {
    const prev      = i > 0 ? prices[i - 1].close : day.close;
    const changePct = prev !== 0
      ? parseFloat(((day.close - prev) / prev * 100).toFixed(2))
      : 0;

    let direction = 'Flat';
    if (changePct > 0.05)  direction = 'Up';
    if (changePct < -0.05) direction = 'Down';

    // Combine same-day news with prior-evening news (deduplicated by headline)
    const sameDay  = newsMap[day.date]     ?? [];
    const priorEve = (nextDayMap[day.date] ?? []).filter(
      a => !sameDay.some(s => s.headline === a.headline)
    );
    const allNews  = [...sameDay, ...priorEve];

    return {
      date:       day.date,
      close:      day.close,
      change_pct: changePct,
      direction,
      news:       allNews
    };
  });
}
