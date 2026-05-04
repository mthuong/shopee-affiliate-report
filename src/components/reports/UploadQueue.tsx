'use client'

import { useEffect, useRef } from 'react'
import { parseImage } from '@/actions/parse'
import type { ParsedOrder } from '@/lib/supabase/types'

// Gemini 2.5 Flash free tier peaks at 5 requests/min. 13s spacing keeps any
// rolling 60s window at ≤5 calls with a small safety margin.
const RATE_LIMIT_INTERVAL_MS = 13000

export type QueueStatus = 'queued' | 'throttled' | 'parsing' | 'done' | 'failed'

export type QueueItem = {
  id: string
  file: File
  previewUrl: string
  status: QueueStatus
  orders: ParsedOrder[]
  error: string | null
}

type Props = {
  items: QueueItem[]
  onUpdate: (id: string, patch: Partial<QueueItem>) => void
  onRemove: (id: string) => void
  onClearAll: () => void
  onParsed?: (orders: ParsedOrder[]) => void
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({ base64: result.split(',')[1], mimeType: file.type })
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function UploadQueue({ items, onUpdate, onRemove, onClearAll, onParsed }: Props) {
  const inFlight = useRef(false)
  const lastCallAtRef = useRef<number>(0)

  useEffect(() => {
    if (inFlight.current) return
    const next = items.find((i) => i.status === 'queued')
    if (!next) return

    inFlight.current = true
    const id = next.id
    const file = next.file
    ;(async () => {
      try {
        const waitMs = Math.max(0, RATE_LIMIT_INTERVAL_MS - (Date.now() - lastCallAtRef.current))
        if (waitMs > 0) {
          onUpdate(id, { status: 'throttled' })
          await new Promise((r) => setTimeout(r, waitMs))
        }
        lastCallAtRef.current = Date.now()
        onUpdate(id, { status: 'parsing' })
        const image = await readFileAsBase64(file)
        const { orders, error } = await parseImage(image)
        if (error) {
          console.error('[UploadQueue] parse failed for', file.name, '—', error)
          onUpdate(id, { status: 'failed', error })
        } else {
          onUpdate(id, { status: 'done', orders, error: null })
          onParsed?.(orders)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('[UploadQueue] threw for', file.name, '—', message, e)
        onUpdate(id, { status: 'failed', error: message })
      } finally {
        inFlight.current = false
      }
    })()
  }, [items, onUpdate, onParsed])

  if (items.length === 0) return null

  const failedCount = items.filter((i) => i.status === 'failed').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const activeCount = items.filter((i) => i.status === 'parsing' || i.status === 'throttled' || i.status === 'queued').length
  const allDone = activeCount === 0

  return (
    <div className="mt-4 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-200 text-sm">
          Upload queue — {doneCount} parsed{failedCount > 0 ? `, ${failedCount} failed` : ''}{!allDone ? `, ${activeCount} pending` : ''}
        </h3>
        <button onClick={onClearAll} className="text-xs text-gray-500 hover:text-gray-300">Clear all</button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">Throttled to 5 requests/min (Gemini free tier)</p>
      <div className="space-y-2">
        {items.map((item) => (
          <QueueRow key={item.id} item={item} onRetry={() => onUpdate(item.id, { status: 'queued', error: null })} onRemove={() => onRemove(item.id)} />
        ))}
      </div>
    </div>
  )
}

function QueueRow({ item, onRetry, onRemove }: { item: QueueItem; onRetry: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-gray-900/40 rounded-lg p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.previewUrl} alt="" className="w-12 h-12 object-cover rounded border border-gray-800 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{item.file.name}</p>
        <p className="text-[11px] text-gray-500">{(item.file.size / 1024).toFixed(0)} KB</p>
        {item.status === 'failed' && item.error && (
          <p className="text-[11px] text-red-400 mt-0.5 break-words" title={item.error}>{item.error}</p>
        )}
      </div>
      <StatusBadge item={item} />
      <div className="flex items-center gap-1">
        {item.status === 'failed' && (
          <button onClick={onRetry} className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded">Retry</button>
        )}
        {item.status !== 'parsing' && item.status !== 'throttled' && (
          <button onClick={onRemove} className="text-xs text-gray-500 hover:text-red-400 px-2 py-1" title="Remove">✕</button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ item }: { item: QueueItem }) {
  switch (item.status) {
    case 'queued':
      return <span className="text-xs text-gray-500">⏳ Queued</span>
    case 'throttled':
      return <span className="text-xs text-gray-400 animate-pulse" title="Waiting for rate limit">⏱ Waiting…</span>
    case 'parsing':
      return <span className="text-xs text-orange-400 animate-pulse">⚡ Parsing…</span>
    case 'done':
      return <span className="text-xs text-green-400">✓ {item.orders.length} order{item.orders.length === 1 ? '' : 's'}</span>
    case 'failed':
      return <span className="text-xs text-red-400" title={item.error ?? ''}>✗ Failed</span>
  }
}
