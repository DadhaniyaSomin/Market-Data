import { XMLParser } from 'fast-xml-parser';
import crypto from 'node:crypto';
import type { NewsItem, UniverseMeta } from './types.ts';

const ALLOWLISTED_RSS_FEEDS = [
  {
    name: 'Economic Times Markets',
    url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms',
  },
  {
    name: 'LiveMint Markets',
    url: 'https://www.livemint.com/rss/markets',
  },
];

const RESULTS_KEYWORDS = ['q1', 'q2', 'q3', 'q4', 'results', 'earnings', 'profit', 'revenue', 'ebitda', 'dividend', 'margin'];
const SECTOR_KEYWORDS: Record<string, string[]> = {
  Banking: ['rbi', 'banking', 'credit growth', 'psu bank', 'repo rate', 'npa', 'lenders', 'bank nifty'],
  IT: ['it stocks', 'software', 'nasdaq', 'us tech', 'outsourcing', 'ai deal', 'it sector'],
  Energy: ['oil', 'crude', 'brent', 'ongc', 'refining', 'petchem', 'gas', 'opec'],
  Auto: ['auto sales', 'ev', 'vehicle', 'suv', 'passenger vehicle', 'two-wheeler'],
  Metals: ['steel', 'metals', 'china stimulus', 'iron ore', 'coal', 'aluminium'],
  Pharma: ['usfda', 'pharma', 'drug', 'fda', 'healthcare'],
  Defence: ['defence', 'order win', 'ministry of defence', 'hal', 'bel', 'aerospace'],
  Telecom: ['telecom', 'tariff', '5g', 'arpu', 'spectrum'],
  Infrastructure: ['infra', 'ports', 'capex', 'order book', 'highway'],
  FMCG: ['fmcg', 'rural demand', 'monsoon', 'consumer staples'],
  Financials: ['nbfc', 'bajaj', 'lending', 'rbi', 'fintech'],
  Power: ['power', 'thermal', 'renewable', 'electricity', 'solar'],
  Consumer: ['jewellery', 'gold', 'retail', 'consumer'],
  Retail: ['retail', 'apparel', 'same-store', 'zudio'],
  Diversified: ['adani', 'conglomerate'],
};

function sanitizeHttpUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textMatchesTerm(haystack: string, term: string): boolean {
  const clean = term.trim().toLowerCase();
  if (!clean) return false;
  if (clean.length <= 4 && /^[a-z0-9&]+$/.test(clean)) {
    const re = new RegExp(`\\b${escapeRegex(clean)}\\b`, 'i');
    return re.test(haystack);
  }
  return haystack.toLowerCase().includes(clean);
}

interface CacheEntry {
  fetchedAt: number;
  items: NewsItem[];
  sourceSummary: string;
}

let newsCache: CacheEntry | null = null;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchMarketRssNews(
  universe: UniverseMeta[],
  forceRefresh = false,
): Promise<{
  items: NewsItem[];
  sourceSummary: string;
  fetchedAt: string;
}> {
  if (!forceRefresh && newsCache && Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL_MS) {
    return {
      items: newsCache.items,
      sourceSummary: newsCache.sourceSummary,
      fetchedAt: new Date(newsCache.fetchedAt).toISOString(),
    };
  }

  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const collected: NewsItem[] = [];
  const activeSources: string[] = [];

  await Promise.all(
    ALLOWLISTED_RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'PreOpenNSE-Scanner/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const parsed = parser.parse(xml);
        const rawItems = parsed?.rss?.channel?.item;
        const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
        if (list.length > 0) activeSources.push(feed.name);

        for (const entry of list.slice(0, 40)) {
          const title = typeof entry?.title === 'string' ? stripHtmlTags(entry.title) : '';
          const description =
            typeof entry?.description === 'string' ? stripHtmlTags(entry.description) : '';
          const link = sanitizeHttpUrl(entry?.link);
          const pubDate = typeof entry?.pubDate === 'string' ? entry.pubDate.trim() : '';
          if (!title) continue;

          const combined = `${title} ${description}`.toLowerCase();
          const matchedSymbols: string[] = [];
          const matchedSectorSet = new Set<string>();
          let isSectorNews = false;

          for (const [sector, terms] of Object.entries(SECTOR_KEYWORDS)) {
            if (terms.some((kw) => textMatchesTerm(combined, kw))) {
              matchedSectorSet.add(sector);
              isSectorNews = true;
            }
          }

          for (const stock of universe) {
            const directMatch =
              textMatchesTerm(combined, stock.ticker) ||
              stock.aliases.some((alias) => textMatchesTerm(combined, alias));

            if (directMatch) {
              matchedSymbols.push(stock.symbol);
              matchedSectorSet.add(stock.sector);
            } else if (matchedSectorSet.has(stock.sector)) {
              matchedSymbols.push(stock.symbol);
            }
          }

          const isResultsNews = RESULTS_KEYWORDS.some((kw) => textMatchesTerm(combined, kw));
          const id = crypto
            .createHash('sha1')
            .update(`${feed.name}:${title}`)
            .digest('hex')
            .slice(0, 12);

          collected.push({
            id,
            title,
            summary: description.slice(0, 260),
            link,
            pubDate,
            source: feed.name,
            matchedSymbols,
            matchedSectors: Array.from(matchedSectorSet),
            isResultsNews,
            isSectorNews,
          });
        }
      } catch {
        // Resilient degradation: skip unreachable feed
      }
    }),
  );

  // Sort newest first when pubDate parses cleanly
  collected.sort((a, b) => {
    const da = Date.parse(a.pubDate) || 0;
    const db = Date.parse(b.pubDate) || 0;
    return db - da;
  });

  const sourceSummary =
    activeSources.length > 0 ? activeSources.join(' + ') : 'RSS Feeds Unavailable';

  const nowMs = Date.now();
  newsCache = {
    fetchedAt: nowMs,
    items: collected,
    sourceSummary,
  };

  return {
    items: collected,
    sourceSummary,
    fetchedAt: new Date(nowMs).toISOString(),
  };
}
