import { GoogleGenAI } from '@google/genai';

export interface VenueRankingInput {
  id?: string;
  name: string;
  address: string;
  types: string[];
  lat: number;
  lng: number;
}

export interface RankedVenue {
  id: string;
  sunScore: number; // 0–100
  reasoning: string;
}

let singletonClient: any = null;
let singletonKey: string | null = null;
function getClient(apiKey: string) {
  if (!singletonClient || singletonKey !== apiKey) {
    singletonClient = new GoogleGenAI({ apiKey });
    singletonKey = apiKey;
  }
  return singletonClient;
}

export async function rankVenuesBySunExposure(
  venues: VenueRankingInput[],
  currentHour: number,
  apiKey: string
): Promise<RankedVenue[]> {
  const client = getClient(apiKey);

  const prompt = `You are a sun exposure analyst. Given these outdoor venues and the current time (${currentHour}:00), score each venue 0-100 for how much direct sunlight it is likely to receive right now. Consider: south-facing patios score higher, north-facing lower, rooftop bars score high, basement bars low. Return a JSON array: [{"id":"...","sunScore":0,"reasoning":"one sentence"}]

Venues: ${JSON.stringify(venues, null, 2)}`;

  try {
    const resp: any = await client.generate({
      model: 'gemini-2.0-flash',
      input: prompt,
      generationConfig: { responseMimeType: 'application/json' },
    });

    // Attempt to extract textual output in several common shapes
    let textOutput = '';
    if (resp?.output?.[0]?.content) {
      // content may be an array of { type: 'output_text', text: '...' } or similar
      for (const c of resp.output[0].content) {
        if (typeof c === 'string') textOutput += c;
        else if (c?.text) textOutput += c.text;
        else if (c?.type === 'output_text' && c?.text) textOutput += c.text;
      }
    } else if (resp?.candidates?.[0]?.content) {
      for (const c of resp.candidates[0].content) {
        if (c?.text) textOutput += c.text;
      }
    } else if (typeof resp === 'string') {
      textOutput = resp;
    } else if (resp?.text) {
      textOutput = resp.text;
    } else {
      textOutput = JSON.stringify(resp);
    }

    // Extract JSON array from text
    const start = textOutput.indexOf('[');
    const end = textOutput.lastIndexOf(']');
    if (start === -1 || end === -1) {
      throw new Error('No JSON array found in model output');
    }
    const jsonStr = textOutput.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) throw new Error('Parsed output is not an array');

    const out: RankedVenue[] = parsed.map((it: any) => {
      const id = String(it.id ?? it.name ?? '');
      let sunScore = Number(it.sunScore ?? it.sun_score ?? it.score ?? 50);
      if (!Number.isFinite(sunScore)) sunScore = 50;
      sunScore = Math.max(0, Math.min(100, Math.round(sunScore)));
      const reasoning = typeof it.reasoning === 'string' ? it.reasoning : String(it.reasoning ?? '');
      return { id, sunScore, reasoning };
    });

    return out;
  } catch (e) {
    console.error('[aiService] rankVenuesBySunExposure failed:', e);
    // Graceful fallback: return neutral scores
    return venues.map((v) => ({ id: String(v.id ?? v.name ?? ''), sunScore: 50, reasoning: 'unavailable' }));
  }
}
