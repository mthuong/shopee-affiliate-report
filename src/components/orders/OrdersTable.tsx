'use client'

import { useState } from 'react'
import { deleteOrder } from '@/actions/orders'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { OrderModal } from './OrderModal'
import { formatVND } from '@/lib/utils/currency'
import { formatOrderDate } from '@/lib/utils/date'
import type { OrderWithStatus, OrderStatus, Client } from '@/lib/supabase/types'

type Props = {
  orders: OrderWithStatus[]
  reportId: string
  statuses: OrderStatus[]
  clients: Client[]
  onDeleteSuccess: (id: string) => void
  onEditSuccess: (updated: OrderWithStatus) => void
}

export function OrdersTable({ orders, reportId, statuses, clients, onDeleteSuccess, onEditSuccess }: Props) {
  const { showToast } = useToast()
  const [editOrder, setEditOrder] = useState<OrderWithStatus | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderWithStatus | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOrder(deleteTarget.id, reportId)
      onDeleteSuccess(deleteTarget.id)
      showToast('Order deleted')
    } catch {
      showToast('Failed to delete order', 'error')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (orders.length === 0) return <p className="text-gray-500 text-sm py-4 text-center">No orders yet.</p>

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800 text-left">
              <th className="pb-2 pr-4">Order ID</th>
              <th className="pb-2 pr-4">Product</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4 text-right">Commission</th>
              <th className="pb-2 pr-4">Client</th>
              <th className="pb-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="group border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer" onClick={() => setEditOrder(order)}>
                <td className="py-3 pr-4 text-white font-mono text-xs">{order.order_id}</td>
                <td className="py-3 pr-4 text-gray-300 max-w-[180px] truncate">{order.product_name ?? '—'}</td>
                <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{formatOrderDate(order.ordered_at)}</td>
                <td className={`py-3 pr-4 ${order.order_statuses.name === 'Đã hoàn thành' ? 'text-green-400' : 'text-red-400'}`}>{order.order_statuses.name}</td>
                <td className="py-3 pr-4 text-right text-white">{formatVND(order.commission)}</td>
                <td className="py-3 pr-4 text-gray-400">{order.clients?.name ?? '—'}</td>
                <td className="py-3 text-center">
                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(order) }} className="invisible group-hover:visible text-red-400 hover:text-red-300 p-1" title="Delete">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editOrder && <OrderModal open onClose={() => setEditOrder(null)} onSaved={(updated) => { onEditSuccess(updated); setEditOrder(null) }} reportId={reportId} statuses={statuses} clients={clients} order={editOrder} />}
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} title="Delete Order?"
        message={<>Order <strong className="text-white font-mono">{deleteTarget?.order_id}</strong> will be permanently deleted.</>} />
    </>
  )
}
