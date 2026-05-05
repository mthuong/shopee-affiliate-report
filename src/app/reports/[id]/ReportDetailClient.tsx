'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImageUploader } from '@/components/reports/ImageUploader'
import { PendingOrdersReview, type EditableOrder } from '@/components/reports/PendingOrdersReview'
import { UploadQueue, type QueueItem } from '@/components/reports/UploadQueue'
import { OrdersTable } from '@/components/orders/OrdersTable'
import { OrderModal } from '@/components/orders/OrderModal'
import { AssignClientButton } from '@/components/orders/AssignClientButton'
import { AssignClientPopup } from '@/components/orders/AssignClientPopup'
import { SelectActionBar } from '@/components/orders/SelectActionBar'
import { assignOrdersToClient } from '@/actions/orders'
import { useToast } from '@/components/ui/Toast'
import { CROP_CONFIRM_ENABLED } from '@/lib/utils/feature-flags'
import type { OrderWithStatus, OrderStatus, Client, ParsedOrder } from '@/lib/supabase/types'

type Props = {
  reportId: string
  initialOrders: OrderWithStatus[]
  statuses: OrderStatus[]
  clients: Client[]
}

export function ReportDetailClient({ reportId, initialOrders, statuses, clients }: Props) {
  const { showToast } = useToast()
  const router = useRouter()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [pendingOrders, setPendingOrders] = useState<EditableOrder[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const nextKeyRef = useRef(0)

  type AssignMode = 'idle' | 'picker' | 'selecting' | 'submitting'
  const [assignMode, setAssignMode] = useState<AssignMode>('idle')
  const [assignClient, setAssignClient] = useState<Client | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function addFiles(files: File[]) {
    const items: QueueItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      // Flag on: pause for cropper. Flag off: go straight to queued — the
      // worker reads the original file as a fallback when cropped is missing.
      status: CROP_CONFIRM_ENABLED ? 'needs-crop' : 'queued',
      orders: [],
      error: null,
    }))
    setQueue((prev) => [...prev, ...items])
  }

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => {
      const target = prev.find((i) => i.id === id)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
        if (target.croppedPreviewUrl) URL.revokeObjectURL(target.croppedPreviewUrl)
      }
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const clearQueue = useCallback(() => {
    setQueue((prev) => {
      for (const i of prev) {
        URL.revokeObjectURL(i.previewUrl)
        if (i.croppedPreviewUrl) URL.revokeObjectURL(i.croppedPreviewUrl)
      }
      return []
    })
  }, [])

  const appendParsed = useCallback((parsed: ParsedOrder[]) => {
    if (parsed.length === 0) return
    setPendingOrders((prev) => [
      ...prev,
      ...parsed.map((o) => ({ ...o, _key: `parsed-${nextKeyRef.current++}` })),
    ])
  }, [])

  const onChangeOrder = useCallback((key: string, field: keyof ParsedOrder, value: string | number) => {
    setPendingOrders((prev) => prev.map((o) => (o._key === key ? { ...o, [field]: value } : o)))
  }, [])

  const onRemoveOrder = useCallback((key: string) => {
    setPendingOrders((prev) => prev.filter((o) => o._key !== key))
  }, [])

  const numUnassigned = initialOrders.filter((o) => o.client_id === null).length
  const inSelectMode = assignMode === 'selecting' || assignMode === 'submitting'

  function handleAssignClick() {
    if (numUnassigned === 0) {
      showToast('All orders already have a client assigned')
      return
    }
    setAssignMode('picker')
  }

  function handlePickerConfirm(client: Client) {
    setAssignClient(client)
    setSelectedIds(new Set())
    setAssignMode('selecting')
  }

  function handlePickerCancel() {
    setAssignMode('idle')
  }

  const onToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const unassignedIds = initialOrders.filter((o) => o.client_id === null).map((o) => o.id)
      if (prev.size === unassignedIds.length) return new Set()
      return new Set(unassignedIds)
    })
  }, [initialOrders])

  function handleSelectCancel() {
    setAssignMode('idle')
    setAssignClient(null)
    setSelectedIds(new Set())
  }

  async function handleSelectConfirm() {
    if (!assignClient || selectedIds.size === 0) return
    setAssignMode('submitting')
    try {
      const ids = [...selectedIds]
      const { updatedCount } = await assignOrdersToClient(ids, assignClient.id, reportId)
      const skipped = ids.length - updatedCount
      showToast(
        skipped > 0
          ? `Assigned ${updatedCount} of ${ids.length} orders (${skipped} already had a client)`
          : `Assigned ${updatedCount} order${updatedCount === 1 ? '' : 's'} to ${assignClient.name}`
      )
      setAssignMode('idle')
      setAssignClient(null)
      setSelectedIds(new Set())
      router.refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to assign orders', 'error')
      setAssignMode('selecting')
    }
  }

  // Revoke any remaining object URLs on unmount
  useEffect(() => {
    return () => {
      setQueue((prev) => {
        for (const i of prev) {
          URL.revokeObjectURL(i.previewUrl)
          if (i.croppedPreviewUrl) URL.revokeObjectURL(i.croppedPreviewUrl)
        }
        return prev
      })
    }
  }, [])

  return (
    <div>
      <ImageUploader onFilesSelected={addFiles} pendingCount={queue.length} />

      <UploadQueue items={queue} onUpdate={updateItem} onRemove={removeItem} onClearAll={clearQueue} onParsed={appendParsed} />

      {pendingOrders.length > 0 && (
        <div className="mt-6">
          <PendingOrdersReview
            reportId={reportId}
            orders={pendingOrders}
            statuses={statuses}
            onChange={onChangeOrder}
            onRemove={onRemoveOrder}
            onSaved={(_saved, skipped) => {
              setPendingOrders([])
              clearQueue()
              router.refresh()
              showToast(skipped > 0 ? `Saved. ${skipped} duplicate(s) skipped.` : 'Orders saved')
            }}
            onDiscard={() => {
              setPendingOrders([])
              clearQueue()
            }}
          />
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-200">Orders</h2>
          {!inSelectMode && (
            <div className="flex gap-2">
              <AssignClientButton disabled={numUnassigned === 0} onClick={handleAssignClick} />
              <button onClick={() => setShowAddModal(true)} className="text-sm text-orange-400 border border-orange-500/40 px-3 py-1.5 rounded-lg hover:bg-orange-500/10">
                + Add Manually
              </button>
            </div>
          )}
        </div>
        <OrdersTable
          orders={initialOrders}
          reportId={reportId}
          statuses={statuses}
          clients={clients}
          onDeleteSuccess={() => router.refresh()}
          onEditSuccess={() => router.refresh()}
          selectMode={inSelectMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleSelectAll={onToggleSelectAll}
        />
      </div>

      <AssignClientPopup
        open={assignMode === 'picker'}
        clients={clients}
        onConfirm={handlePickerConfirm}
        onCancel={handlePickerCancel}
      />

      {inSelectMode && assignClient && (
        <SelectActionBar
          count={selectedIds.size}
          clientName={assignClient.name}
          submitting={assignMode === 'submitting'}
          onCancel={handleSelectCancel}
          onConfirm={handleSelectConfirm}
        />
      )}

      <OrderModal open={showAddModal} onClose={() => setShowAddModal(false)} onSaved={() => { router.refresh(); setShowAddModal(false) }} reportId={reportId} statuses={statuses} clients={clients} />
    </div>
  )
}
