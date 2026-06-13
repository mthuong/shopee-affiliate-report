'use client'

import { useEffect, useRef, useState } from 'react'
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
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleSelectAll?: () => void
}

export function OrdersTable({
  orders,
  reportId,
  statuses,
  clients,
  onDeleteSuccess,
  onEditSuccess,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const { showToast } = useToast()
  const [editOrder, setEditOrder] = useState<OrderWithStatus | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderWithStatus | null>(null)
  const [deleting, setDeleting] = useState(false)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const unassigned = orders.filter((o) => o.client_id === null)
  const numUnassigned = unassigned.length
  const numSelected = selectedIds?.size ?? 0
  const allSelected = numUnassigned > 0 && numSelected === numUnassigned
  const someSelected = numSelected > 0 && numSelected < numUnassigned

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected
  }, [someSelected])

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

  if (orders.length === 0) return <p className="text-muted text-sm py-4 text-center">No orders yet.</p>

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-line text-left">
              {selectMode && (
                <th className="pb-2 pr-3 w-8">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onToggleSelectAll?.()}
                    disabled={numUnassigned === 0}
                    aria-label="Select all unassigned orders"
                  />
                </th>
              )}
              <th className="pb-2 pr-4">Order ID</th>
              <th className="pb-2 pr-4">Product</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4 text-right">Commission</th>
              <th className="pb-2 pr-4">Client</th>
              {!selectMode && <th className="pb-2 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isUnassigned = order.client_id === null
              const isChecked = selectedIds?.has(order.id) ?? false
              const rowClickable = !selectMode
              return (
                <tr
                  key={order.id}
                  className={`group border-b border-line/50 ${rowClickable ? 'hover:bg-sunken/40 cursor-pointer' : ''} ${selectMode && !isUnassigned ? 'opacity-50' : ''}`}
                  onClick={rowClickable ? () => setEditOrder(order) : undefined}
                >
                  {selectMode && (
                    <td className="py-3 pr-3 w-8" onClick={(e) => e.stopPropagation()}>
                      {isUnassigned ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSelect?.(order.id)}
                          aria-label={`Select order ${order.order_id}`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="py-3 pr-4 text-ink font-mono text-xs">{order.order_id}</td>
                  <td className="py-3 pr-4 text-muted max-w-[180px] truncate">{order.product_name ?? '—'}</td>
                  <td className="py-3 pr-4 text-muted whitespace-nowrap">{formatOrderDate(order.ordered_at)}</td>
                  <td className={`py-3 pr-4 ${order.order_statuses.name === 'Đã hoàn thành' ? 'text-success' : 'text-danger'}`}>{order.order_statuses.name}</td>
                  <td className="py-3 pr-4 text-right text-ink">{formatVND(order.commission)}</td>
                  <td className="py-3 pr-4 text-muted">{order.clients?.name ?? '—'}</td>
                  {!selectMode && (
                    <td className="py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(order) }} className="invisible group-hover:visible text-danger hover:text-danger p-1" title="Delete">🗑</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editOrder && <OrderModal open onClose={() => setEditOrder(null)} onSaved={(updated) => { onEditSuccess(updated); setEditOrder(null) }} reportId={reportId} statuses={statuses} clients={clients} order={editOrder} />}
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} title="Delete Order?"
        message={<>Order <strong className="text-ink font-mono">{deleteTarget?.order_id}</strong> will be permanently deleted.</>} />
    </>
  )
}
