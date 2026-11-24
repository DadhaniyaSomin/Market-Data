import { GoogleGenAI, Type } from '@google/genai';
import type { AIRationaleItem } from '../lib/data/types.ts';

export interface RationaleInputStock {
  ticker: string;
  name: string;
  sector: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  changePct: number;
  gapPct: number;
  volumeRatio: number;
  atr14DailyPct: number;
  vwap: number | null;
  orbHigh: number | null;
  orbLow: number | null;
  relativeStrengthVsNifty: number;
  totalScore: number;
  catalystStatus: 'FRESH' | 'PRICED_IN' | 'NONE';
  headlines: string[];
  entry: number;
  stopLoss: number;
  target: number;
  quantity: number;
  plannedRisk: number;
  capitalUsed: number;
}

export interface RationaleGenerationResult {
  rationales: AIRationaleItem[];
  providerUsed: 'gemini';
  modelUsed: string;
  error?: string;
}

const SYSTEM_INSTRUCTION = [
  'You are an institutional Indian equities (NSE) pre-market analyst assisting an intraday trader.',
  'For each shortlisted stock provided in the JSON input, write:',
  '1) rationale: a concise 3-4 line plain-English decision-support summary explaining how the computed metrics (liquidity, ATR%, catalyst/volume, VWAP/ORB/RS vs Nifty) align with the stated direction.',
  '2) risks: an array of exactly 2 concise, concrete intraday risks specific to the setup and market context.',
  'STRICT RULES:',
  '- Do NOT compute, modify, or invent prices, quantities, stop-loss, targets, or scores.',
  '- Do NOT invent news, earnings, or corporate events. Only reference headlines explicitly provided in the input; if headlines is empty, state that setup is price/volume driven without specific RSS news.',
  '- Keep tone objective and educational (decision-support, not investment advice).',
].join('\n');

function validateAndNormalizeRationales(
  rawParsed: unknown,
  allowedTickers: Set<string>,
  model: string,
): AIRationaleItem[] {
  const list = Array.isArray(rawParsed)
    ? rawParsed
    : rawParsed && typeof rawParsed === 'object' && Array.isArray((rawParsed as { items?: unknown }).items)
      ? (rawParsed as { items: unknown[] }).items
      : [];

  const validated: AIRationaleItem[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const ticker = typeof obj.ticker === 'string' ? obj.ticker.trim().toUpperCase() : '';
    const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : '';
    const rawRisks = Array.isArray(obj.risks)
      ? obj.risks.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim())
      : [];

    if (!ticker || !allowedTickers.has(ticker) || !rationale || rawRisks.length < 2) {
      continue;
    }

    validated.push({
      ticker,
      rationale,
      risks: [rawRisks[0], rawRisks[1]],
      provider: 'gemini',
      model,
    });
  }

  return validated;
}

export async function generateShortlistRationales(
  stocks: RationaleInputStock[],
  marketContextSummary: string,
): Promise<RationaleGenerationResult> {
  const model = 'gemini-4-hydrogen';

  if (stocks.length === 0) {
    return {
      rationales: [],
      providerUsed: 'gemini',
      modelUsed: model,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      rationales: [],
      providerUsed: 'gemini',
      modelUsed: model,
      error: 'GEMINI_API_KEY is not configured in .env / server secrets.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptPayload = JSON.stringify({
      marketContext: marketContextSummary,
      shortlistedStocks: stocks,
    });

    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: `Analyze these pre-filtered NSE intraday candidates and return structured JSON:\n${promptPayload}`,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ticker: {
                    type: Type.STRING,
                    description: 'Exact NSE ticker symbol from the input.',
                  },
                  rationale: {
                    type: Type.STRING,
                    description: '3-4 line plain-English decision-support rationale referencing only computed inputs.',
                  },
                  risks: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Exactly 2 concise intraday risks.',
                  },
                },
                required: ['ticker', 'rationale', 'risks'],
              },
            },
          },
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (attempt === 0 && (msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE'))) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        throw err;
      }
    }

    const rawText = (response?.text ?? '[]').trim();
    const parsed = JSON.parse(rawText);
    const allowed = new Set(stocks.map((s) => s.ticker.toUpperCase()));
    const rationales = validateAndNormalizeRationales(parsed, allowed, model);

    if (rationales.length === 0) {
      return {
        rationales: [],
        providerUsed: 'gemini',
        modelUsed: model,
        error: 'Gemini response failed structured JSON validation.',
      };
    }

    return {
      rationales,
      providerUsed: 'gemini',
      modelUsed: model,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected Gemini API error';
    return {
      rationales: [],
      providerUsed: 'gemini',
      modelUsed: model,
      error: message,
    };
  }
}
