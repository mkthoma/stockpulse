import { isLikelyEnglishHeadline } from '../../lib/isEnglishHeadline.js';

export const TOOL_DEF = {
  name: 'search_news',
  description: 'Search recent news articles about a stock or company. Returns headlines, sources, dates and descriptions.',
  parameters: {
    type: 'object',
    properties: {
      query:     { type: 'string', description: 'Company name or search terms e.g. Tesla earnings' },
      from_date: { type: 'string', description: 'ISO date YYYY-MM-DD for earliest article' }
    },
    required: ['query', 'from_date']
  }
};

async function getNewsApiKey() {
  const stored = await chrome.storage.local.get('newsApiKey');
  const key = stored.newsApiKey;
  if (!key) throw new Error('NewsAPI key not set. Please configure it in StockPulse options.');
  return key;
}

export async function search_news({ query, from_date }) {
  const apiKey = await getNewsApiKey();
  const url = [
    'https://newsapi.org/v2/everything',
    `?q=${encodeURIComponent(query)}`,
    `&from=${from_date}`,
    '&sortBy=publishedAt',
    '&language=en',
    /* Fetch extra rows — many are non-English despite language=en */
    '&pageSize=50',
    `&apiKey=${apiKey}`
  ].join('');

  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NewsAPI error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI responded: ${data.message ?? data.status}`);
  }

  const mapped = (data.articles ?? []).map(a => ({
    date:        (a.publishedAt ?? '').slice(0, 10),
    headline:    a.title ?? '',
    source:      a.source?.name ?? 'Unknown',
    description: a.description ?? '',
    url:         a.url ?? ''
  }));

  const englishOnly = mapped.filter(a => isLikelyEnglishHeadline(a.headline));
  return englishOnly.slice(0, 15);
}
