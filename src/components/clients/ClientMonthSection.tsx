'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateCommissionPercent } from '@/actions/report-clients'
import { deleteOrder } from '@/actions/orders'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { OrderModal } from '@/components/orders/OrderModal'
import { formatVND } from '@/lib/utils/currency'
import { formatOrderDate } from '@/lib/utils/date'
import { calcReturn, calcSubtotal, calcTotalReturn, COMPLETED_STATUS_ID } from '@/lib/utils/commission'
import { exportToExcel } from '@/lib/excel/export'
import type { OrderWithStatus, OrderStatus, Client, Report } from '@/lib/supabase/types'

type Props = {
  report: Report
  client: Client
  initialOrders: OrderWithStatus[]
  initialPercent: number
  statuses: OrderStatus[]
  allClients: Client[]
}

export function ClientMonthSection({ report, client, initialOrders, initialPercent, statuses, allClients }: Props) {
  const { showToast } = useToast()
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const [percent, setPercent] = useState(initialPercent)
  const [percentInput, setPercentInput] = useState(String(initialPercent))
  const [savingPercent, setSavingPercent] = useState(false)
  const [editOrder, setEditOrder] = useState<OrderWithStatus | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderWithStatus | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const subtotal = calcSubtotal(orders)
  const totalReturn = calcTotalReturn(orders.filter((o) => o.status_id === COMPLETED_STATUS_ID), percent)

  async function handleSavePercent() {
    const val = Math.min(100, Math.max(0, parseInt(percentInput, 10) || 0))
    setPercentInput(String(val))
    setSavingPercent(true)
    try {
      await updateCommissionPercent(report.id, client.id, val)
      setPercent(val)
      showToast('Commission % updated')
    } catch {
      showToast('Failed to update commission %', 'error')
    } finally {
      setSavingPercent(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOrder(deleteTarget.id, report.id)
      setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id))
      router.refresh()
      showToast('Order deleted')
    } catch {
      showToast('Failed to delete', 'error')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  function handleExport() {
    const rows = orders.map((o) => {
      const isCompleted = o.status_id === COMPLETED_STATUS_ID
      return {
        order_id: o.order_id,
        product_name: o.product_name,
        ordered_at: o.ordered_at,
        status_name: o.order_statuses.name,
        commission: o.commission,
        commission_return: isCompleted ? calcReturn(o.commission, percent) : 0,
      }
    })
    exportToExcel(rows, `${client.name.replace(/\s+/g, '_')}_${report.name.replace(/\s+/g, '_')}.xlsx`)
  }

  return (
    <>
      <div className="border border-line rounded-card p-5 mb-4">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-accent text-lg">{report.name}</h3>
            <div className="text-sm mt-1">
              <span className="text-muted">Subtotal: </span>
              <span className="text-ink">{formatVND(subtotal)}</span>
              <span className="text-muted"> → Return: </span>
              <span className="text-success font-semibold">{formatVND(totalReturn)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted text-sm">Commission %:</span>
            <input type="number" min={0} max={100} value={percentInput} onChange={(e) => setPercentInput(e.target.value)} className="input w-20 text-center" />
            <button onClick={handleSavePercent} disabled={savingPercent} className="px-3 py-1.5 text-sm bg-sunken hover:bg-sunken text-ink rounded-control disabled:opacity-50">
              {savingPercent ? '…' : 'Save'}
            </button>
            <button onClick={handleExport} className="px-3 py-1.5 text-sm bg-success hover:bg-success text-on-accent rounded-control">📥 Export</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted border-b border-line text-left">
                <th className="pb-2 pr-4">Order ID</th>
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-right">Commission</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="py-4 text-center text-muted">No orders</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="group border-b border-line/50 hover:bg-sunken/40 cursor-pointer" onClick={() => setEditOrder(o)}>
                  <td className="py-3 pr-4 text-ink font-mono text-xs">{o.order_id}</td>
                  <td className="py-3 pr-4 text-muted max-w-[160px] truncate">{o.product_name ?? '—'}</td>
                  <td className="py-3 pr-4 text-muted whitespace-nowrap text-xs">{formatOrderDate(o.ordered_at)}</td>
                  <td className={`py-3 pr-4 text-xs ${o.status_id === COMPLETED_STATUS_ID ? 'text-success' : 'text-danger'}`}>{o.order_statuses.name}</td>
                  <td className="py-3 pr-4 text-right text-ink">{formatVND(o.commission)}</td>
                  <td className="py-3 text-center">
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(o) }} className="invisible group-hover:visible text-danger hover:text-danger p-1">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <button onClick={() => setShowAddModal(true)} className="text-sm text-accent border border-accent/40 px-3 py-1.5 rounded-control hover:bg-accent/10">
            + Add Order Manually
          </button>
        </div>
      </div>

      {editOrder && <OrderModal open onClose={() => setEditOrder(null)} onSaved={(updated) => {
        setOrders((prev) =>
          updated.client_id === client.id
            ? prev.map((o) => (o.id === updated.id ? updated : o))
            : prev.filter((o) => o.id !== updated.id)
        )
        setEditOrder(null)
        router.refresh()
      }} reportId={report.id} statuses={statuses} clients={allClients} order={editOrder} />}
      <OrderModal open={showAddModal} onClose={() => setShowAddModal(false)} onSaved={(newOrder) => {
        if (newOrder.client_id === client.id) setOrders((prev) => [...prev, newOrder])
        router.refresh()
      }} reportId={report.id} statuses={statuses} clients={allClients} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} title="Delete Order?"
        message={<>Order <strong className="text-ink font-mono">{deleteTarget?.order_id}</strong> will be permanently deleted.</>} />
    </>
  )
}
