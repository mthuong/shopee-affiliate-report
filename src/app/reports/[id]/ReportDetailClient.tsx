'use client'

import { useState } from 'react'
import { ImageUploader } from '@/components/reports/ImageUploader'
import { PendingOrdersReview } from '@/components/reports/PendingOrdersReview'
import { OrdersTable } from '@/components/orders/OrdersTable'
import { OrderModal } from '@/components/orders/OrderModal'
import { parseImages } from '@/actions/parse'
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingOrders, setPendingOrders] = useState<ParsedOrder[] | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  async function handleParseAll() {
    if (pendingFiles.length === 0) return
    setIsParsing(true)
    try {
      const images = await Promise.all(
        pendingFiles.map(async (f) => {
          const buffer = await f.arrayBuffer()
          const base64 = Buffer.from(buffer).toString('base64')
          return { base64, mimeType: f.type }
        })
      )
      const { orders: parsedOrders, failedChunkCount } = await parseImages(images)
      if (failedChunkCount > 0) showToast(`${failedChunkCount} batch(es) failed to parse`, 'error')
      if (parsedOrders.length > 0) {
        setPendingOrders(parsedOrders)
        setPendingFiles([])
      } else {
        showToast('No orders found in the selected images', 'error')
      }
    } catch (e: any) {
      showToast(e.message ?? 'Parsing failed', 'error')
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <div>
      <ImageUploader onFilesSelected={(files) => setPendingFiles((prev) => [...prev, ...files])} pendingCount={pendingFiles.length} />
      {pendingFiles.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <button onClick={handleParseAll} disabled={isParsing} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {isParsing ? 'Parsing…' : `Parse All (${pendingFiles.length} image${pendingFiles.length > 1 ? 's' : ''})`}
          </button>
          <button onClick={() => setPendingFiles([])} className="text-sm text-gray-500 hover:text-gray-300">Clear</button>
        </div>
      )}

      {pendingOrders && (
        <div className="mt-6">
          <PendingOrdersReview
            reportId={reportId}
            initialOrders={pendingOrders}
            statuses={statuses}
            onSaved={(saved, skipped) => {
              setPendingOrders(null)
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
            onDiscard={() => setPendingOrders(null)}
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
