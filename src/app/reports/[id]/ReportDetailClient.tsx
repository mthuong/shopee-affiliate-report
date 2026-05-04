'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageUploader } from '@/components/reports/ImageUploader'
import { PendingOrdersReview, type EditableOrder } from '@/components/reports/PendingOrdersReview'
import { UploadQueue, type QueueItem } from '@/components/reports/UploadQueue'
import { OrdersTable } from '@/components/orders/OrdersTable'
import { OrderModal } from '@/components/orders/OrderModal'
import { useToast } from '@/components/ui/Toast'
import type { OrderWithStatus, OrderStatus, Client, ParsedOrder } from '@/lib/supabase/types'

type Props = {
  reportId: string
  initialOrders: OrderWithStatus[]
  statuses: OrderStatus[]
  clients: Client[]
}

export function ReportDetailClient({ reportId, initialOrders, statuses, clients }: Props) {
  const { showToast } = useToast()
  const [orders, setOrders] = useState(initialOrders)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [pendingOrders, setPendingOrders] = useState<EditableOrder[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const nextKeyRef = useRef(0)

  function addFiles(files: File[]) {
    const items: QueueItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'queued',
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
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const clearQueue = useCallback(() => {
    setQueue((prev) => {
      for (const i of prev) URL.revokeObjectURL(i.previewUrl)
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

  // Revoke any remaining object URLs on unmount
  useEffect(() => {
    return () => {
      setQueue((prev) => {
        for (const i of prev) URL.revokeObjectURL(i.previewUrl)
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
            onSaved={(saved, skipped) => {
              setPendingOrders([])
              clearQueue()
              const existingIds = new Set(orders.map((o) => `${o.order_id}:${o.report_id}`))
              const newOrders = saved
                .filter((o) => !existingIds.has(`${o.order_id}:${o.report_id}`))
                .map((o) => ({
                  ...o,
                  order_statuses: statuses.find((s) => s.id === o.status_id) ?? { id: o.status_id, name: '' },
                  clients: null,
                }))
              setOrders((prev) => [...prev, ...newOrders])
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
          <button onClick={() => setShowAddModal(true)} className="text-sm text-orange-400 border border-orange-500/40 px-3 py-1.5 rounded-lg hover:bg-orange-500/10">
            + Add Manually
          </button>
        </div>
        <OrdersTable
            orders={orders}
            reportId={reportId}
            statuses={statuses}
            clients={clients}
            onDeleteSuccess={(id) => setOrders((prev) => prev.filter((o) => o.id !== id))}
            onEditSuccess={(updated) => setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))}
          />
      </div>

      <OrderModal open={showAddModal} onClose={() => setShowAddModal(false)} onSaved={(newOrder) => { setOrders((prev) => [...prev, newOrder]); setShowAddModal(false) }} reportId={reportId} statuses={statuses} clients={clients} />
    </div>
  )
}
