'use server'

import { parseImagesWithGemini } from '@/lib/gemini/parse-images'
import { isRateLimitError, type ModelName } from '@/lib/gemini/model-cascade'
import { createClient } from '@/lib/supabase/server'
import type { ParsedOrder } from '@/lib/supabase/types'

type ImageInput = { base64: string; mimeType: string }

export async function parseImages(
  images: ImageInput[],
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; failedChunkCount: number }> {
  const { orders, failures } = await parseImagesWithGemini(images, modelName)
  return { orders, failedChunkCount: failures.length }
}

export async function parseImage(
  image: ImageInput,
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; error: string | null; rateLimited: boolean }> {
  try {
    const { orders, failures } = await parseImagesWithGemini([image], modelName)
    if (failures.length > 0) {
      const message = failures[0].message
      const rateLimited = isRateLimitError(message)
      console.error('[parseImage]', modelName, 'failed:', message)
      return { orders: [], error: message, rateLimited }
    }
    return { orders, error: null, rateLimited: false }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    const rateLimited = isRateLimitError(e)
    console.error('[parseImage]', modelName, 'threw:', message, e)
    return { orders: [], error: message, rateLimited }
  }
}

export async function resolveStatusId(statusName: string): Promise<number> {
  if (typeof statusName !== 'string' || !statusName.trim()) {
    throw new Error('Order status is missing — please assign a status before saving')
  }
  const supabase = await createClient()
  const normalized = statusName.trim()

  const { data: existing } = await supabase
    .from('order_statuses')
    .select('id')
    .ilike('name', normalized)
    .single()

  if (existing) return existing.id

  const { data: inserted, error } = await supabase
    .from('order_statuses')
    .insert({ name: normalized })
    .select('id')
    .single()

  if (error) throw error
  return inserted.id
}
