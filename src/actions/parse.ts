'use server'

import { parseImagesWithGemini } from '@/lib/gemini/parse-images'
import { createClient } from '@/lib/supabase/server'
import type { ParsedOrder } from '@/lib/supabase/types'

type ImageInput = { base64: string; mimeType: string }

export async function parseImages(
  images: ImageInput[]
): Promise<{ orders: ParsedOrder[]; failedChunkCount: number }> {
  const { orders, failures } = await parseImagesWithGemini(images)
  return { orders, failedChunkCount: failures.length }
}

export async function parseImage(
  image: ImageInput
): Promise<{ orders: ParsedOrder[]; error: string | null }> {
  try {
    const { orders, failures } = await parseImagesWithGemini([image])
    if (failures.length > 0) {
      const message = failures[0].message
      console.error('[parseImage] failed:', message)
      return { orders: [], error: message }
    }
    return { orders, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('[parseImage] threw:', message, e)
    return { orders: [], error: message }
  }
}

export async function resolveStatusId(statusName: string): Promise<number> {
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
