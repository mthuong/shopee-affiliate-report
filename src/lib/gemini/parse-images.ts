import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedOrder } from '@/lib/supabase/types'
import type { ModelName } from './model-cascade'

const CHUNK_SIZE = 10

// Shopee order codes seen in the wild are 14 uppercase-alphanumeric chars
// (e.g. 260426S774FDFG, 2604282M8582FA). The 12–16 range is a deliberate
// buffer in case Shopee tweaks the format slightly. Tight enough to reject
// hallucinated junk, loose enough not to drop real orders.
const SHOPEE_ORDER_ID_RE = /^[0-9A-Z]{12,16}$/

export function buildGeminiPrompt(): string {
  return `You are an OCR assistant. Extract Shopee affiliate orders from the provided screenshots.

CRITICAL: Only return an order if you can clearly read its "ID đơn đặt hàng:" line. The Shopee order code is alphanumeric, ~14 characters (example: 260426S774FDFG). If the ID is cut off, blurry, partially obscured, or not visible at all, SKIP that order entirely. Never guess, infer, or invent an order ID. Returning fewer accurate orders is better than inventing IDs.

For each order with a readable ID, return a JSON array entry:
{
  "order_id": "the Shopee order code exactly as shown",
  "product_name": "the product name, or null if not visible",
  "status_name": "the order status text exactly as shown (e.g. Đã hoàn thành, Đã hủy)",
  "commission_vnd": <integer commission amount in VND, no currency symbol>,
  "ordered_at": "ISO 8601 datetime string (e.g. 2026-04-24T15:47:00)"
}

Return ONLY the JSON array. No explanation, no markdown outside the array.
If no orders have readable IDs, return [].`
}

export function parseGeminiResponse(raw: string): ParsedOrder[] {
  if (!raw?.trim()) return []
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (o) =>
          typeof o.order_id === 'string'
          && SHOPEE_ORDER_ID_RE.test(o.order_id.trim())
          && typeof o.commission_vnd === 'number'
      )
      .map((o) => ({
        ...o,
        order_id: o.order_id.trim(),
        status_name: typeof o.status_name === 'string' ? o.status_name : '',
      }))
  } catch {
    return []
  }
}

export type ChunkFailure = { chunkIndex: number; message: string }

export async function parseImagesWithGemini(
  imageFiles: { base64: string; mimeType: string }[],
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; failures: ChunkFailure[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })
  const prompt = buildGeminiPrompt()
  const allOrders: ParsedOrder[] = []
  const failures: ChunkFailure[] = []

  for (let i = 0; i < imageFiles.length; i += CHUNK_SIZE) {
    const chunk = imageFiles.slice(i, i + CHUNK_SIZE)
    const chunkIndex = Math.floor(i / CHUNK_SIZE)
    try {
      const parts = [
        { text: prompt },
        ...chunk.map((f) => ({ inlineData: { data: f.base64, mimeType: f.mimeType } })),
      ]
      const result = await model.generateContent(parts)
      allOrders.push(...parseGeminiResponse(result.response.text()))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[parseImagesWithGemini] chunk', chunkIndex, 'failed:', message, e)
      failures.push({ chunkIndex, message })
    }
  }

  return { orders: allOrders, failures }
}
