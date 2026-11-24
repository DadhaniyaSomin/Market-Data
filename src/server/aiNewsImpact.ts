import { GoogleGenAI, Type } from '@google/genai';
import type { NewsImpactItem, NewsItem } from '../lib/data/types.ts';

export interface NewsImpactResult {
  impacts: NewsImpactItem[];
  modelUsed: string;
  error?: string;
}

const MODEL_CANDIDATES = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

const SYSTEM_INSTRUCTION = [
  'You are an Indian equities (NSE) pre-market news analyst.',
  'Given real RSS market headlines (with optional matched NSE tickers/sectors and latest sector performance context), analyze how each headline is likely to affect the Indian market:',
  '- scope: "COMPANY" if the headline targets a specific listed company/stock, "SECTOR" if it affects an industry/sector (e.g., Banking, IT, Energy, Metals, Auto), or "MACRO" if broad market/rates/FX.',
  '- targetEntity: concise name of the primary stock (e.g. "Reliance Industries (RELIANCE)") or sector (e.g. "Banking & Financials") or "Broad Nifty 50".',
  '- expectedDirection: "POSITIVE", "NEGATIVE", "MIXED", or "NEUTRAL".',
  '- sectorReaction: 1-2 plain-English sentences explaining how the relevant NSE sector reacts (e.g. margin impact, rate sensitivity, demand outlook, or cross-sector spillover).',
  '- companyReaction: 1-2 plain-English sentences explaining how the specific company/stock (or top sector bellwethers if macro/sector news) reacts and what price/volume follow-through to watch.',
  '- watchPoint: 1 concise intraday risk or invalidation trigger (e.g. gap-up fade if >3% already priced in).',
  'STRICT RULES: Do NOT invent numbers, earnings figures, or events not implied by the headline. Educational decision-support only.',
].join('\n');

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unexpected Gemini API error';
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string } };
    if (parsed?.error?.message) {
      const code = parsed.error.code ? `(${parsed.error.code}) ` : '';
      return `${code}${parsed.error.message}`;
    }
  } catch {
    // Plain text error
  }
  return raw;
}

function isTransientDemandError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

export async function analyzeNewsMarketImpact(
  headlines: NewsItem[],
  sectorContextSummary: string,
): Promise<NewsImpactResult> {
  const primaryModel = MODEL_CANDIDATES[0];
  if (headlines.length === 0) {
    return { impacts: [], modelUsed: primaryModel };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      impacts: [],
      modelUsed: primaryModel,
      error: 'GEMINI_API_KEY is not configured in .env / server secrets.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const inputPayload = headlines.slice(0, 8).map((h) => ({
    id: h.id,
    title: h.title,
    summary: h.summary,
    source: h.source,
    matchedSectors: h.matchedSectors,
    matchedTickers: h.matchedSymbols.map((s) => s.replace('.NS', '')),
  }));

  let lastError: unknown = null;

  for (const model of MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: JSON.stringify({
            sectorContext: sectorContextSummary,
            headlines: inputPayload,
          }),
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  scope: { type: Type.STRING },
                  targetEntity: { type: Type.STRING },
                  expectedDirection: { type: Type.STRING },
                  sectorReaction: { type: Type.STRING },
                  companyReaction: { type: Type.STRING },
                  watchPoint: { type: Type.STRING },
                },
                required: [
                  'id',
                  'scope',
                  'targetEntity',
                  'expectedDirection',
                  'sectorReaction',
                  'companyReaction',
                  'watchPoint',
                ],
              },
            },
          },
        });

        const rawText = (response?.text ?? '[]').trim();
        const parsed = JSON.parse(rawText);
        const list = Array.isArray(parsed) ? parsed : [];
        const headlineMap = new Map(inputPayload.map((h) => [h.id, h.title]));

        const impacts: NewsImpactItem[] = [];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const obj = item as Record<string, unknown>;
          const id = typeof obj.id === 'string' ? obj.id.trim() : '';
          const title = headlineMap.get(id);
          if (!title) continue;

          const rawScope = typeof obj.scope === 'string' ? obj.scope.toUpperCase() : 'MACRO';
          const scope: NewsImpactItem['scope'] =
            rawScope === 'COMPANY' || rawScope === 'SECTOR' ? rawScope : 'MACRO';

          const rawDir =
            typeof obj.expectedDirection === 'string' ? obj.expectedDirection.toUpperCase() : 'NEUTRAL';
          const expectedDirection: NewsImpactItem['expectedDirection'] =
            rawDir === 'POSITIVE' || rawDir === 'NEGATIVE' || rawDir === 'MIXED'
              ? rawDir
              : 'NEUTRAL';

          const targetEntity =
            typeof obj.targetEntity === 'string' ? obj.targetEntity.trim() : 'Indian Equities';
          const sectorReaction =
            typeof obj.sectorReaction === 'string' ? obj.sectorReaction.trim() : '';
          const companyReaction =
            typeof obj.companyReaction === 'string' ? obj.companyReaction.trim() : '';
          const watchPoint =
            typeof obj.watchPoint === 'string' ? obj.watchPoint.trim() : '';

          if (!sectorReaction || !companyReaction) continue;

          impacts.push({
            id,
            title,
            scope,
            targetEntity,
            expectedDirection,
            sectorReaction,
            companyReaction,
            watchPoint: watchPoint || 'Verify price reaction against VWAP and 15m ORB.',
            model,
          });
        }

        if (impacts.length === 0) {
          return {
            impacts: [],
            modelUsed: model,
            error: 'Gemini news impact response failed structured JSON validation.',
          };
        }

        return { impacts, modelUsed: model };
      } catch (err) {
        lastError = err;
        if (isTransientDemandError(err)) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          break;
        }
        return {
          impacts: [],
          modelUsed: model,
          error: formatGeminiError(err),
        };
      }
    }
  }

  return {
    impacts: [],
    modelUsed: primaryModel,
    error: formatGeminiError(lastError),
  };
}
