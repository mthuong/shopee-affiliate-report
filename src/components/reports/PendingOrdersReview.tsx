'use client'

import { useState } from 'react'
import { createOrders } from '@/actions/orders'
import { resolveStatusId } from '@/actions/parse'
import { useToast } from '@/components/ui/Toast'
import { formatVND } from '@/lib/utils/currency'
import { formatOrderDate } from '@/lib/utils/date'
import type { ParsedOrder, OrderStatus, Order } from '@/lib/supabase/types'

type EditableOrder = ParsedOrder & { _key: string }

type Props = {
  reportId: string
  initialOrders: ParsedOrder[]
  statuses: OrderStatus[]
  onSaved: (saved: Order[], skipped: number) => void
  onDiscard: () => void
}

export function PendingOrdersReview({ reportId, initialOrders, statuses, onSaved, onDiscard }: Props) {
  const { showToast } = useToast()
  const [orders, setOrders] = useState<EditableOrder[]>(
    initialOrders.map((o, i) => ({ ...o, _key: `${i}` }))
  )
  const [saving, setSaving] = useState(false)

  function update(key: string, field: keyof ParsedOrder, value: string | number) {
    setOrders((prev) => prev.map((o) => (o._key === key ? { ...o, [field]: value } : o)))
  }

  async function handleSaveAll() {
    if (orders.length === 0) return
    setSaving(true)
    try {
      const resolved = await Promise.all(
        orders.map(async (o) => ({
          report_id: reportId,
          order_id: o.order_id,
          product_name: o.product_name,
          status_id: await resolveStatusId(o.status_name),
          commission: o.commission_vnd,
          ordered_at: new Date(o.ordered_at).toISOString(),
          client_id: null,
          is_manual: false,
        }))
      )
      const { saved, skipped } = await createOrders(resolved)
      onSaved(saved, skipped)
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save orders', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-orange-500/40 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-orange-400">📋 {orders.length} order{orders.length !== 1 ? 's' : ''} pending review</h3>
        <div className="flex gap-2">
          <button onClick={onDiscard} className="px-3 py-1.5 text-sm border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800">Discard</button>
          <button onClick={handleSaveAll} disabled={saving || orders.length === 0} className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 text-white rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700 text-left">
              <th className="pb-2 pr-3">Order ID</th>
              <th className="pb-2 pr-3">Product</th>
              <th className="pb-2 pr-3">Date</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3 text-right">Commission</th>
              <th className="pb-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._key} className="border-b border-gray-800/50">
                <td className="py-2 pr-3"><input value={o.order_id} onChange={(e) => update(o._key, 'order_id', e.target.value)} className="input text-xs w-36" /></td>
                <td className="py-2 pr-3"><input value={o.product_name ?? ''} onChange={(e) => update(o._key, 'product_name', e.target.value)} className="input text-xs w-40" placeholder="—" /></td>
                <td className="py-2 pr-3 text-gray-400 whitespace-nowrap text-xs">{formatOrderDate(o.ordered_at)}</td>
                <td className="py-2 pr-3">
                  <select value={o.status_name} onChange={(e) => update(o._key, 'status_name', e.target.value)} className="input text-xs">
                    {statuses.map((s) => <option key={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3 text-right text-white">{formatVND(o.commission_vnd)}</td>
                <td className="py-2 text-center">
                  <button onClick={() => setOrders((prev) => prev.filter((x) => x._key !== o._key))} className="text-red-400 hover:text-red-300 text-xs p-1" title="Remove">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
