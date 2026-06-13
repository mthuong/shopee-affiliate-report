'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createOrder, updateOrder } from '@/actions/orders'
import { useToast } from '@/components/ui/Toast'
import { parseVND } from '@/lib/utils/currency'
import type { OrderWithStatus, OrderStatus, Client } from '@/lib/supabase/types'

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: (order: OrderWithStatus) => void
  reportId: string
  statuses: OrderStatus[]
  clients: Client[]
  order?: OrderWithStatus
}

export function OrderModal({ open, onClose, onSaved, reportId, statuses, clients, order }: Props) {
  const { showToast } = useToast()
  const isEdit = !!order

  const [orderId, setOrderId] = useState(order?.order_id ?? '')
  const [productName, setProductName] = useState(order?.product_name ?? '')
  const [statusId, setStatusId] = useState(order?.status_id ?? statuses[0]?.id ?? 1)
  const [commission, setCommission] = useState(order ? String(order.commission) : '')
  const [orderedAt, setOrderedAt] = useState(
    order?.ordered_at ? order.ordered_at.slice(0, 16) : new Date().toISOString().slice(0, 16)
  )
  const [clientId, setClientId] = useState<string>(order?.client_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!orderId.trim()) return
    setSaving(true)
    try {
      const payload = {
        report_id: reportId,
        order_id: orderId.trim(),
        product_name: productName.trim() || null,
        status_id: statusId,
        commission: parseVND(commission),
        ordered_at: new Date(orderedAt).toISOString(),
        client_id: clientId || null,
        is_manual: true,
      }
      if (isEdit && order) {
        await updateOrder(order.id, payload)
        showToast('Order updated')
        onSaved?.({
          ...order,
          ...payload,
          order_statuses: statuses.find((s) => s.id === statusId) ?? order.order_statuses,
        })
      } else {
        const created = await createOrder(payload)
        showToast('Order added')
        onSaved?.({
          ...created,
          order_statuses: statuses.find((s) => s.id === statusId) ?? { id: statusId, name: '' },
          clients: clients.find((c) => c.id === clientId) ?? null,
        } as OrderWithStatus)
      }
      onClose()
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save order', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '✏️ Edit Order' : '+ Add Order Manually'}>
      <div className="space-y-3">
        {[
          { label: 'Order ID (Shopee)', el: <input type="text" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. 2604282M8582FA" className="input" /> },
          { label: 'Product Name', el: <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Optional" className="input" /> },
          { label: 'Status', el: <select value={statusId} onChange={(e) => setStatusId(Number(e.target.value))} className="input">{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> },
          { label: 'Commission (₫)', el: <input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="6630" className="input" min={0} /> },
          { label: 'Order Date', el: <input type="datetime-local" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} className="input" /> },
          { label: 'Client', el: <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input"><option value="">— Unassigned —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> },
        ].map(({ label, el }) => (
          <div key={label}>
            <label className="block text-xs text-muted mb-1">{label}</label>
            {el}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-control border border-line-strong text-muted hover:bg-sunken">Cancel</button>
        <button onClick={handleSave} disabled={saving || !orderId.trim()} className="px-4 py-2 rounded-control bg-accent hover:bg-accent-hover text-on-accent font-medium disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Order'}
        </button>
      </div>
    </Modal>
  )
}
