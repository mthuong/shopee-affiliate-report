import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedOrder } from '@/lib/supabase/types'

const CHUNK_SIZE = 10

export function buildGeminiPrompt(): string {
  return `You are an OCR assistant. Extract all Shopee affiliate orders from the provided screenshots.

For each order found, return a JSON array with objects in this exact format:
{
  "order_id": "the Shopee order code (e.g. 2604282M8582FA)",
  "product_name": "the product name, or null if not visible",
  "status_name": "the order status text exactly as shown (e.g. Đã hoàn thành, Đã hủy)",
  "commission_vnd": <integer commission amount in VND, no currency symbol>,
  "ordered_at": "ISO 8601 datetime string (e.g. 2026-04-24T15:47:00)"
}

Return ONLY the JSON array. No explanation, no markdown outside the array.
If no orders are found, return an empty array [].`
}

export function parseGeminiResponse(raw: string): ParsedOrder[] {
  if (!raw?.trim()) return []
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (o) => typeof o.order_id === 'string' && typeof o.commission_vnd === 'number'
      )
      .map((o) => ({
        ...o,
        status_name: typeof o.status_name === 'string' ? o.status_name : '',
      }))
  } catch {
    return []
  }
}

export type ChunkFailure = { chunkIndex: number; message: string }

export async function parseImagesWithGemini(
  imageFiles: { base64: string; mimeType: string }[]
): Promise<{ orders: ParsedOrder[]; failures: ChunkFailure[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
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
