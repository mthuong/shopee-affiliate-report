# Bulk-Assign Orders to Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/reports/[id]`, let users bulk-assign multiple unassigned orders to a chosen client through a small picker popup → inline select-mode table → fixed-bottom action bar, and refresh the table from the server after any successful assignment.

**Architecture:** State machine lives in `ReportDetailClient` (closest common ancestor of trigger button and table). Three new presentational components: `AssignClientButton` (trigger), `AssignClientPopup` (small client-picker modal), `SelectActionBar` (fixed-bottom). `OrdersTable` gains a `selectMode` prop family for a checkbox column and suppressed row click. A required refactor drops local `orders` `useState` from `ReportDetailClient` so `router.refresh()` actually re-renders the table — incidentally fixing the existing `OrderModal` stale `clients.name` bug. New server action `assignOrdersToClient` upserts the `report_clients` row, updates only still-unassigned orders, and revalidates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS, Tailwind, Jest (jsdom env).

**Spec:** `docs/superpowers/specs/2026-05-04-assign-orders-to-client-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/actions/__tests__/orders.test.ts` | Empty-array short-circuit test for the new action |
| Create | `src/components/orders/AssignClientButton.tsx` | Trigger button (controlled) |
| Create | `src/components/orders/AssignClientPopup.tsx` | Small client-picker modal |
| Create | `src/components/orders/SelectActionBar.tsx` | Fixed-bottom action bar shown during select mode |
| Modify | `src/actions/orders.ts` | Add `assignOrdersToClient` |
| Modify | `src/components/orders/OrdersTable.tsx` | Accept `selectMode` props; render checkbox column; suppress row click + hide trash |
| Modify | `src/app/reports/[id]/ReportDetailClient.tsx` | Drop local `orders` state; own assign-flow state machine; wire components |

**Note on testing:** the spec lists two unit tests for `assignOrdersToClient`, but the second (filter-out-already-assigned) requires Supabase mocking which the repo does not currently set up. We implement the testable empty-array case and verify the `.is('client_id', null)` guard via the manual smoke test in Task 8 — pragmatic match to existing test conventions (`parse-images.test.ts` only tests pure helpers, not the Gemini-calling function).

---

## Task 1: Add `assignOrdersToClient` server action

**Files:**
- Create: `src/actions/__tests__/orders.test.ts`
- Modify: `src/actions/orders.ts` (add new export)

- [ ] **Step 1: Write the failing test**

Create `src/actions/__tests__/orders.test.ts`:

```ts
import { assignOrdersToClient } from '@/actions/orders'

describe('assignOrdersToClient', () => {
  it('returns { updatedCount: 0 } without touching the database when orderIds is empty', async () => {
    const result = await assignOrdersToClient([], 'any-client-id', 'any-report-id')
    expect(result).toEqual({ updatedCount: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/actions/__tests__/orders.test.ts`

Expected: FAIL with a TypeScript / module error indicating `assignOrdersToClient` is not exported from `@/actions/orders`.

- [ ] **Step 3: Implement the action**

Open `src/actions/orders.ts`. Append at the end of the file:

```ts
export async function assignOrdersToClient(
  orderIds: string[],
  clientId: string,
  reportId: string
): Promise<{ updatedCount: number }> {
  if (orderIds.length === 0) return { updatedCount: 0 }
  const supabase = await createClient()

  // Ensure the report_clients row exists so commission % defaults are in place.
  await supabase
    .from('report_clients')
    .upsert(
      { report_id: reportId, client_id: clientId, commission_percent: DEFAULT_COMMISSION_PERCENT },
      { onConflict: 'report_id,client_id', ignoreDuplicates: true }
    )

  // Defensive: only update orders that are still unassigned, so concurrent
  // assignments from another tab don't overwrite a different client.
  const { data, error } = await supabase
    .from('orders')
    .update({ client_id: clientId })
    .in('id', orderIds)
    .is('client_id', null)
    .select('id')

  if (error) throw error

  revalidatePath(`/reports/${reportId}`)
  revalidatePath(`/clients/${clientId}`)
  return { updatedCount: data?.length ?? 0 }
}
```

`createClient`, `revalidatePath`, and `DEFAULT_COMMISSION_PERCENT` are already imported at the top of this file — no new imports needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/actions/__tests__/orders.test.ts`

Expected: 1 test passes. The empty-array path returns before `createClient()` is called, so the test never touches Supabase.

- [ ] **Step 5: Run the full test suite + type check**

```bash
npx jest
npx tsc --noEmit
```

Both should pass. Existing 32 tests + 1 new test = 33 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/actions/orders.ts src/actions/__tests__/orders.test.ts
git commit -m "feat: add assignOrdersToClient server action"
```

---

## Task 2: Refactor `ReportDetailClient` to drop local `orders` state

**Why first:** This refactor must happen before the new feature wires `router.refresh()` after submit, because `router.refresh()` does not re-init `useState`. Doing it first lets us verify edit/delete still work in isolation, and incidentally fixes the existing `OrderModal` stale-`clients.name` bug.

**Files:**
- Modify: `src/app/reports/[id]/ReportDetailClient.tsx`

- [ ] **Step 1: Replace the file contents**

Open `src/app/reports/[id]/ReportDetailClient.tsx`. Replace the entire file with:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
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
          <button onClick={() => setShowAddModal(true)} className="text-sm text-orange-400 border border-orange-500/40 px-3 py-1.5 rounded-lg hover:bg-orange-500/10">
            + Add Manually
          </button>
        </div>
        <OrdersTable
          orders={initialOrders}
          reportId={reportId}
          statuses={statuses}
          clients={clients}
          onDeleteSuccess={() => router.refresh()}
          onEditSuccess={() => router.refresh()}
        />
      </div>

      <OrderModal open={showAddModal} onClose={() => setShowAddModal(false)} onSaved={() => { router.refresh(); setShowAddModal(false) }} reportId={reportId} statuses={statuses} clients={clients} />
    </div>
  )
}
```

**What changed:**
- Removed `const [orders, setOrders] = useState(initialOrders)` and all `setOrders` calls.
- Added `const router = useRouter()`.
- `OrdersTable` receives `initialOrders` directly.
- `onDeleteSuccess` and `onEditSuccess` are now `() => router.refresh()`.
- Manual-add `OrderModal` `onSaved` is now `() => { router.refresh(); setShowAddModal(false) }`.
- `PendingOrdersReview` `onSaved` no longer merges `saved` into local state — it calls `router.refresh()`. The `saved` parameter is unused; renamed to `_saved` to satisfy lint.

- [ ] **Step 2: Type check + lint + tests**

```bash
npx tsc --noEmit
npx eslint 'src/app/reports/[id]/ReportDetailClient.tsx'
npx jest
```

All should pass.

- [ ] **Step 3: Manual smoke test**

Open `http://localhost:3000/reports/<some-report-id>` (the dev server is running on :3000). Verify:
- Editing an order via row click → save: the table refreshes and shows updated values, including the **Client column showing the new client name** (this is the bug fix).
- Deleting an order via the trash icon: row disappears.
- Adding an order via "Add Manually": new row appears.
- Parsing a screenshot via the uploader → review pane → Save All: orders appear in the table.

If any of those break, do not proceed. Investigate.

- [ ] **Step 4: Commit**

```bash
git add src/app/reports/[id]/ReportDetailClient.tsx
git commit -m "refactor: drop local orders state in ReportDetailClient

Use router.refresh() after each mutation so the table re-renders
with fresh server data. Incidentally fixes OrderModal's stale
clients.name bug — local-state spread no longer applies."
```

---

## Task 3: Build `AssignClientPopup` component

**Files:**
- Create: `src/components/orders/AssignClientPopup.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/orders/AssignClientPopup.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Client } from '@/lib/supabase/types'

type Props = {
  open: boolean
  clients: Client[]
  onConfirm: (client: Client) => void
  onCancel: () => void
}

export function AssignClientPopup({ open, clients, onConfirm, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<string>('')

  function handleConfirm() {
    const client = clients.find((c) => c.id === selectedId)
    if (!client) return
    onConfirm(client)
    setSelectedId('')
  }

  function handleCancel() {
    setSelectedId('')
    onCancel()
  }

  return (
    <Modal open={open} onClose={handleCancel} title="Assign Client">
      <div className="space-y-3">
        <div>
          <label htmlFor="assign-client-select" className="block text-xs text-gray-400 mb-1">Client</label>
          <select
            id="assign-client-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="input"
          >
            <option value="">— Choose a client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={handleCancel} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">Cancel</button>
        <button
          onClick={handleConfirm}
          disabled={!selectedId}
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/orders/AssignClientPopup.tsx
```

Both should pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/AssignClientPopup.tsx
git commit -m "feat: add AssignClientPopup component"
```

---

## Task 4: Build `SelectActionBar` component

**Files:**
- Create: `src/components/orders/SelectActionBar.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/orders/SelectActionBar.tsx`:

```tsx
'use client'

type Props = {
  count: number
  clientName: string
  submitting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function SelectActionBar({ count, clientName, submitting, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-950/90 backdrop-blur border-t border-gray-800 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-200">
          Assign <span className="text-white font-semibold">{count}</span> order{count === 1 ? '' : 's'} to <span className="text-orange-400 font-semibold">{clientName}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || count === 0}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/orders/SelectActionBar.tsx
```

Both should pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/SelectActionBar.tsx
git commit -m "feat: add SelectActionBar component"
```

---

## Task 5: Build `AssignClientButton` component

**Files:**
- Create: `src/components/orders/AssignClientButton.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/orders/AssignClientButton.tsx`:

```tsx
'use client'

type Props = {
  disabled: boolean
  onClick: () => void
}

export function AssignClientButton({ disabled, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-orange-400 border border-orange-500/40 px-3 py-1.5 rounded-lg hover:bg-orange-500/10 disabled:opacity-50"
      title={disabled ? 'No unassigned orders to assign' : undefined}
    >
      Assign Client
    </button>
  )
}
```

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/orders/AssignClientButton.tsx
```

Both should pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/AssignClientButton.tsx
git commit -m "feat: add AssignClientButton trigger component"
```

---

## Task 6: Add select-mode to `OrdersTable`

**Files:**
- Modify: `src/components/orders/OrdersTable.tsx`

- [ ] **Step 1: Replace the file contents**

Open `src/components/orders/OrdersTable.tsx`. Replace the entire file with:

```tsx
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

  if (orders.length === 0) return <p className="text-gray-500 text-sm py-4 text-center">No orders yet.</p>

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800 text-left">
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
                  className={`group border-b border-gray-800/50 ${rowClickable ? 'hover:bg-gray-800/40 cursor-pointer' : ''} ${selectMode && !isUnassigned ? 'opacity-50' : ''}`}
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
                  <td className="py-3 pr-4 text-white font-mono text-xs">{order.order_id}</td>
                  <td className="py-3 pr-4 text-gray-300 max-w-[180px] truncate">{order.product_name ?? '—'}</td>
                  <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{formatOrderDate(order.ordered_at)}</td>
                  <td className={`py-3 pr-4 ${order.order_statuses.name === 'Đã hoàn thành' ? 'text-green-400' : 'text-red-400'}`}>{order.order_statuses.name}</td>
                  <td className="py-3 pr-4 text-right text-white">{formatVND(order.commission)}</td>
                  <td className="py-3 pr-4 text-gray-400">{order.clients?.name ?? '—'}</td>
                  {!selectMode && (
                    <td className="py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(order) }} className="invisible group-hover:visible text-red-400 hover:text-red-300 p-1" title="Delete">🗑</button>
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
        message={<>Order <strong className="text-white font-mono">{deleteTarget?.order_id}</strong> will be permanently deleted.</>} />
    </>
  )
}
```

**What changed:**
- Added 4 new optional props: `selectMode`, `selectedIds`, `onToggleSelect`, `onToggleSelectAll`. All default to off so existing callers (Client Detail page) keep working unchanged.
- New checkbox column rendered only when `selectMode` is on. Header checkbox uses a ref to set `indeterminate` (React doesn't expose it as a prop).
- Already-assigned rows: no checkbox in their cell, row text dimmed via `opacity-50`.
- Row click → edit modal is suppressed when `selectMode`. Trash column is hidden when `selectMode`.
- Checkbox cells `stopPropagation` on click so they don't trigger row click (defense in case `selectMode` is somehow off transiently).

- [ ] **Step 2: Type check + lint + tests**

```bash
npx tsc --noEmit
npx eslint src/components/orders/OrdersTable.tsx
npx jest
```

All should pass.

- [ ] **Step 3: Manual smoke test (no select mode yet)**

Reload `/reports/<id>`. Without changing `ReportDetailClient`, the table should render and behave **exactly as before** — `selectMode` defaults to `false`. Verify edit-row, delete-row, and trash-icon-on-hover still work. Visit `/clients/<id>` too — `ClientMonthSection` does not use `OrdersTable`, so it's unaffected, but a quick load check is cheap.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/OrdersTable.tsx
git commit -m "feat: add select-mode props to OrdersTable"
```

---

## Task 7: Wire up the assign flow in `ReportDetailClient`

**Files:**
- Modify: `src/app/reports/[id]/ReportDetailClient.tsx`

- [ ] **Step 1: Add the assign-flow state machine and wire components**

Open `src/app/reports/[id]/ReportDetailClient.tsx`.

**Add new imports** at the top, alongside existing imports:

```tsx
import { AssignClientButton } from '@/components/orders/AssignClientButton'
import { AssignClientPopup } from '@/components/orders/AssignClientPopup'
import { SelectActionBar } from '@/components/orders/SelectActionBar'
import { assignOrdersToClient } from '@/actions/orders'
```

**Add new state** inside the component, after the existing `useState` declarations and `useRef`:

```tsx
type AssignMode = 'idle' | 'picker' | 'selecting' | 'submitting'
const [assignMode, setAssignMode] = useState<AssignMode>('idle')
const [assignClient, setAssignClient] = useState<Client | null>(null)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

(`Client` is already imported via the `OrderStatus, Client, ParsedOrder` import line.)

**Add handlers** after the existing `appendParsed`/`onChangeOrder`/`onRemoveOrder` callbacks:

```tsx
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
```

**Replace the orders header `<div>` and `<OrdersTable>`** — find this block:

```tsx
<div className="mt-6">
  <div className="flex items-center justify-between mb-3">
    <h2 className="font-semibold text-gray-200">Orders</h2>
    <button onClick={() => setShowAddModal(true)} className="text-sm text-orange-400 border border-orange-500/40 px-3 py-1.5 rounded-lg hover:bg-orange-500/10">
      + Add Manually
    </button>
  </div>
  <OrdersTable
    orders={initialOrders}
    reportId={reportId}
    statuses={statuses}
    clients={clients}
    onDeleteSuccess={() => router.refresh()}
    onEditSuccess={() => router.refresh()}
  />
</div>
```

with:

```tsx
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
```

The `<AssignClientPopup>` and `<SelectActionBar>` go just before the existing `<OrderModal>` at the bottom of the component's JSX.

- [ ] **Step 2: Type check + lint + tests**

```bash
npx tsc --noEmit
npx eslint 'src/app/reports/[id]/ReportDetailClient.tsx'
npx jest
```

All should pass.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/reports/[id]/ReportDetailClient.tsx'
git commit -m "feat: wire up bulk-assign flow in ReportDetailClient"
```

---

## Task 8: Manual smoke test + final verification

- [ ] **Step 1: Run all checks**

```bash
npx tsc --noEmit
npx eslint .
npx jest
```

All should pass. 33 tests (32 existing + 1 from Task 1).

- [ ] **Step 2: Manual happy path**

In the browser at `http://localhost:3000/reports/<some-report-id>`:

1. Verify the header shows two buttons: `Assign Client` and `+ Add Manually`.
2. Click `Assign Client`. The picker popup opens with a client `<select>`.
3. Pick a client and click `Continue`. Popup closes; checkboxes appear on unassigned rows; assigned rows are dimmed without checkboxes; trash icons are hidden; "Add Manually" and "Assign Client" buttons disappear; the bottom action bar appears: `Assign 0 orders to <name>` with Cancel + Confirm (Confirm disabled).
4. Tick the header checkbox → all unassigned rows tick. Counter updates to `Assign N orders`.
5. Untick one row. Header checkbox becomes indeterminate (visual: dash, depending on browser).
6. Click `Confirm`. Bar shows "Assigning…". On completion: toast "Assigned N orders to <name>", action bar disappears, table refreshes, the assigned rows now show the client name in the Client column.

- [ ] **Step 3: Manual cancel paths**

1. Click `Assign Client` → picker opens → click Cancel → popup closes, no state change.
2. Click `Assign Client` → pick client → Continue → in select mode → click Cancel in action bar → action bar disappears, header buttons return, no server call made.
3. Click `Assign Client` → pick client → Continue → press ESC → popup or action bar dismisses (Modal supports ESC; the action bar uses Cancel button, no ESC binding by design).

- [ ] **Step 4: Manual edge cases**

1. **All assigned:** Manually assign all orders one by one via row click. Then click `Assign Client` — button is disabled OR clicking shows the toast `"All orders already have a client assigned"` and stays in idle. (Per implementation: button is disabled when `numUnassigned === 0`, AND the click handler also guards as defense.)
2. **Concurrent assignment:** Open the page in two tabs. In tab A, enter select mode and tick an order. In tab B, assign the same order via row click → save. Switch back to tab A and click Confirm. Expected toast: `"Assigned 0 of 1 orders (1 already had a client)"`. Table refreshes; the order now shows tab B's client.
3. **Single-order edit reload:** Click a row → change the client in the modal → save. The table refreshes and the Client column shows the new client name (this is the OrderModal stale-`clients.name` bug fix from Task 2).

- [ ] **Step 5: Verify no regressions on Client Detail page**

Visit `/clients/<some-client-id>`. The page should render normally. `ClientMonthSection` uses its own table (not `OrdersTable`) so it's structurally untouched, but `OrdersTable`'s prop additions are all optional — no caller breaks.

- [ ] **Step 6: Final commit (only if any drift was fixed during smoke test)**

If you made small adjustments while smoke-testing, commit them:

```bash
git add -A
git commit -m "fix: smoke-test adjustments for bulk-assign"
```

If everything was clean, no commit needed.

---

## Done

Feature is complete:

- Server action `assignOrdersToClient` with empty-array unit test
- ReportDetailClient refactor (drops local `orders` state; fixes OrderModal stale-client bug)
- Three new components: `AssignClientButton`, `AssignClientPopup`, `SelectActionBar`
- `OrdersTable` extended with optional select-mode props
- Full state machine wired in `ReportDetailClient` with picker → select → submit → refresh

Total commits: 7 (one per task, plus an optional smoke-test fix commit).
