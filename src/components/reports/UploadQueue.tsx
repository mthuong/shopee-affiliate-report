'use client'

import { useEffect, useRef, useState } from 'react'
import { parseImage } from '@/actions/parse'
import {
  createCascadeState,
  markCalled,
  markCooled,
  modelShortName,
  pickNextModel,
  MODEL_PREFERENCE,
  type CascadeState,
  type ModelName,
} from '@/lib/gemini/model-cascade'
import type { ParsedOrder } from '@/lib/supabase/types'
import { ImageCropper } from './ImageCropper'

export type QueueStatus =
  | 'needs-crop'
  | 'queued'
  | 'throttled'
  | 'parsing'
  | 'done'
  | 'failed'

export type QueueItem = {
  id: string
  file: File
  previewUrl: string
  status: QueueStatus
  cropped?: { base64: string; mimeType: string }
  croppedPreviewUrl?: string
  orders: ParsedOrder[]
  error: string | null
  model?: ModelName
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
  const cascadeRef = useRef<CascadeState>(createCascadeState())
  const [cooledTick, setCooledTick] = useState(0)

  // ID of the item currently shown in the cropper, or null if no modal is open.
  const [cropTargetId, setCropTargetId] = useState<string | null>(null)
  // True while we're auto-opening the next needs-crop item; user-initiated
  // close suppresses auto-open until they add more files or click Crop.
  const [autoOpenSuppressed, setAutoOpenSuppressed] = useState(false)
  // Number of items already processed in the current cropping batch. Used to
  // derive a forward-counting "X of N" header in the cropper modal.
  const [cropProcessedInBatch, setCropProcessedInBatch] = useState(0)

  // Auto-open the first needs-crop item when none is currently being cropped.
  // Synchronizing modal-open state with the externally-controlled `items` prop
  // requires setState inside an effect — this is the intended pattern here.
  useEffect(() => {
    if (cropTargetId !== null) return
    if (autoOpenSuppressed) return
    const next = items.find((i) => i.status === 'needs-crop')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next) setCropTargetId(next.id)
  }, [items, cropTargetId, autoOpenSuppressed])

  // Reset suppression once every needs-crop item has been resolved.
  useEffect(() => {
    if (!autoOpenSuppressed) return
    const anyNeedsCrop = items.some((i) => i.status === 'needs-crop')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!anyNeedsCrop) setAutoOpenSuppressed(false)
  }, [items, autoOpenSuppressed])

  // Reset the batch counter once no cropping work remains.
  useEffect(() => {
    if (cropProcessedInBatch === 0) return
    const anyNeedsCrop = items.some((i) => i.status === 'needs-crop')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cropTargetId === null && !anyNeedsCrop) setCropProcessedInBatch(0)
  }, [items, cropTargetId, cropProcessedInBatch])

  // Clear cropTargetId when the target item is removed externally.
  useEffect(() => {
    if (cropTargetId === null) return
    const stillExists = items.some((i) => i.id === cropTargetId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!stillExists) setCropTargetId(null)
  }, [items, cropTargetId])

  useEffect(() => {
    if (inFlight.current) return
    const next = items.find((i) => i.status === 'queued')
    if (!next) return

    inFlight.current = true
    const id = next.id
    ;(async () => {
      try {
        // Cropped bytes are populated by the ImageCropper. When the cropping
        // flow is disabled (flag off), the item lands in 'queued' without
        // cropped bytes — fall back to reading the original file directly.
        const cropped: { base64: string; mimeType: string } =
          next.cropped ?? (await readFileAsBase64(next.file))
        while (true) {
          const choice = pickNextModel(cascadeRef.current)
          if (!choice) {
            onUpdate(id, { status: 'failed', error: 'All Gemini models exhausted today — try again after midnight UTC' })
            return
          }

          if (choice.waitMs > 0) {
            onUpdate(id, { status: 'throttled' })
            await new Promise((r) => setTimeout(r, choice.waitMs))
          }

          onUpdate(id, { status: 'parsing' })
          markCalled(cascadeRef.current, choice.model)

          const { orders, error, rateLimited } = await parseImage(cropped, choice.model)

          if (rateLimited) {
            console.warn('[UploadQueue]', choice.model, 'rate-limited; cascading')
            markCooled(cascadeRef.current, choice.model)
            setCooledTick((n) => n + 1)
            continue
          }

          if (error) {
            console.error('[UploadQueue] parse failed for', next.file.name, '—', error)
            onUpdate(id, { status: 'failed', error })
            return
          }

          onUpdate(id, { status: 'done', orders, error: null, model: choice.model })
          onParsed?.(orders)
          return
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('[UploadQueue] threw for', next.file.name, '—', message, e)
        onUpdate(id, { status: 'failed', error: message })
      } finally {
        inFlight.current = false
      }
    })()
  }, [items, onUpdate, onParsed])

  if (items.length === 0) return null

  const failedCount = items.filter((i) => i.status === 'failed').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const activeCount = items.filter(
    (i) => i.status === 'parsing' || i.status === 'throttled' || i.status === 'queued' || i.status === 'needs-crop'
  ).length
  const allDone = activeCount === 0

  void cooledTick
  // eslint-disable-next-line react-hooks/refs
  const availableCount = MODEL_PREFERENCE.length - cascadeRef.current.cooled.size
  const allExhausted = availableCount === 0

  const cropTarget = cropTargetId ? items.find((i) => i.id === cropTargetId) : null
  // Items still awaiting crop (this includes the one currently shown in the modal,
  // which stays in 'needs-crop' state until the user confirms or uses full image).
  const remainingNeedsCrop = items.filter((i) => i.status === 'needs-crop').length
  const totalCropping = cropProcessedInBatch + remainingNeedsCrop
  const cropIndex = cropTarget ? cropProcessedInBatch + 1 : 0

  return (
    <div className="mt-4 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-200 text-sm">
          Upload queue — {doneCount} parsed{failedCount > 0 ? `, ${failedCount} failed` : ''}{!allDone ? `, ${activeCount} pending` : ''}
        </h3>
        <button onClick={onClearAll} className="text-xs text-gray-500 hover:text-gray-300">Clear all</button>
      </div>
      {allExhausted ? (
        <p className="text-[11px] text-red-400 mb-3">⚠ All Gemini models exhausted today — try again after midnight UTC</p>
      ) : (
        <p className="text-[11px] text-gray-500 mb-3">
          {availableCount} of {MODEL_PREFERENCE.length} models available
        </p>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            onRetry={() => onUpdate(item.id, { status: 'queued', error: null })}
            onRemove={() => onRemove(item.id)}
            onCrop={() => setCropTargetId(item.id)}
          />
        ))}
      </div>
      {cropTarget && (
        <ImageCropper
          file={cropTarget.file}
          currentIndex={cropIndex}
          totalCount={totalCropping}
          onConfirm={(result) => {
            const objectUrl = URL.createObjectURL(result.blob)
            onUpdate(cropTarget.id, {
              status: 'queued',
              cropped: { base64: result.base64, mimeType: result.mimeType },
              croppedPreviewUrl: objectUrl,
            })
            setCropProcessedInBatch((n) => n + 1)
            setCropTargetId(null)
          }}
          onUseFullImage={(full) => {
            onUpdate(cropTarget.id, {
              status: 'queued',
              cropped: full,
            })
            setCropProcessedInBatch((n) => n + 1)
            setCropTargetId(null)
          }}
          onClose={() => {
            setCropTargetId(null)
            setAutoOpenSuppressed(true)
          }}
          onRemove={() => {
            setCropTargetId(null)
            onRemove(cropTarget.id)
          }}
        />
      )}
    </div>
  )
}

function QueueRow({
  item,
  onRetry,
  onRemove,
  onCrop,
}: {
  item: QueueItem
  onRetry: () => void
  onRemove: () => void
  onCrop: () => void
}) {
  const thumb = item.croppedPreviewUrl ?? item.previewUrl
  return (
    <div className="flex items-center gap-3 bg-gray-900/40 rounded-lg p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" className="w-12 h-12 object-cover rounded border border-gray-800 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{item.file.name}</p>
        <p className="text-[11px] text-gray-500">{(item.file.size / 1024).toFixed(0)} KB</p>
        {item.status === 'failed' && item.error && (
          <p className="text-[11px] text-red-400 mt-0.5 break-words" title={item.error}>{item.error}</p>
        )}
      </div>
      <StatusBadge item={item} />
      <div className="flex items-center gap-1">
        {item.status === 'needs-crop' && (
          <button onClick={onCrop} className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded">Crop</button>
        )}
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
    case 'needs-crop':
      return <span className="text-xs text-orange-300">✂ Needs crop</span>
    case 'queued':
      return <span className="text-xs text-gray-500">⏳ Queued</span>
    case 'throttled':
      return <span className="text-xs text-gray-400 animate-pulse" title="Waiting for rate limit">⏱ Waiting…</span>
    case 'parsing':
      return <span className="text-xs text-orange-400 animate-pulse">⚡ Parsing…</span>
    case 'done': {
      const suffix = item.model ? ` · ${modelShortName(item.model)}` : ''
      const title = item.model ? `Parsed by ${item.model}` : undefined
      return (
        <span className="text-xs text-green-400" title={title}>
          ✓ {item.orders.length} order{item.orders.length === 1 ? '' : 's'}{suffix}
        </span>
      )
    }
    case 'failed':
      return <span className="text-xs text-red-400" title={item.error ?? ''}>✗ Failed</span>
  }
}
