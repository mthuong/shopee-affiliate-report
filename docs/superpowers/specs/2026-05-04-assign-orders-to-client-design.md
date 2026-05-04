# Bulk-Assign Orders to Client — Design Spec

**Date:** 2026-05-04
**Status:** Approved
**Scope:** `/reports/[id]` page

---

## Problem

On the report detail page, users can already assign one client per order via the row's edit modal. There is no way to assign many unassigned orders to the same client at once, which is the common case after parsing a fresh report. Additionally, when a single order's client is changed via the edit modal, the joined `clients.name` shown in the Client column goes stale until a hard reload — the local-state mutation only carries the new `client_id`, not the joined client row.

## Goal

1. Add a bulk-assign flow: pick a client, then check unassigned orders, then assign — all from `/reports/[id]`.
2. Make any successful assignment (single or bulk) refresh the displayed orders so the Client column reflects truth without a hard reload.

## User Flow

A new "Assign Client" button sits next to "Add Manually" in the report's orders header.

1. **Trigger** — Click "Assign Client". If the report has zero orders with `client_id === null`, show a toast `"All orders already have a client assigned"` and stop. Otherwise open the picker popup.
2. **Picker** — A small modal with a single `<select>` (the existing client list) and Confirm/Cancel buttons. Confirm with a chosen client → enter select mode. Cancel → back to idle.
3. **Select mode** — The existing `OrdersTable` adds a left-most checkbox column.
   - Unassigned rows: enabled checkbox.
   - Already-assigned rows: empty cell where the checkbox would be, row text muted. The Client column already shows the assignee.
   - Header checkbox toggles all currently-unassigned rows.
   - Row click → edit modal is suppressed.
   - Trash icon is hidden.
   - "Add Manually" button is hidden.
   - The image uploader continues to function — parsing in the background is orthogonal.
   - A fixed-bottom-of-viewport action bar shows: `"Assign N orders to <client.name>"` with Cancel and Confirm buttons. Confirm is disabled when `selectedIds.size === 0`. ESC dismisses to idle.
4. **Submit** — Confirm calls `assignOrdersToClient`. Action bar shows "Assigning…" and controls are disabled. On success: toast `"Assigned N orders to <name>"`, `router.refresh()`, exit to idle. On failure: toast the error message, stay in select mode with selection preserved so the user can retry.

## State Machine

State lives in `ReportDetailClient` (closest common ancestor of `AssignClientButton` + `OrdersTable`):

```
mode: 'idle' | 'picker' | 'selecting' | 'submitting'
client: Client | null      // set on picker confirm, cleared on idle
selectedIds: Set<string>   // cleared on idle/submit success
```

`AssignClientButton` and `SelectActionBar` are thin presentational components driven by these props and bubble transitions back via callbacks.

Transitions:

```
idle      → picker      (button click; only if any unassigned orders exist)
picker    → selecting   (Confirm in picker)
picker    → idle        (Cancel / ESC / backdrop)
selecting → submitting  (Confirm in action bar)
selecting → idle        (Cancel / ESC)
submitting → idle       (action success)
submitting → selecting  (action failure)
```

`OrdersTable` derives `selectMode` from `mode === 'selecting' || mode === 'submitting'`.

## Components & File Changes

### New files

- **`src/components/orders/AssignClientButton.tsx`** — the trigger button. Receives `disabled` (when no unassigned orders exist) and `onClick`. Calls `onClick` to ask the parent to enter `picker` mode.
- **`src/components/orders/AssignClientPopup.tsx`** — modal that wraps `<Modal>`. Receives `open`, `clients`, `onConfirm(client)`, `onCancel`. Single `<select>` + Confirm/Cancel.
- **`src/components/orders/SelectActionBar.tsx`** — `fixed bottom-0 inset-x-0` bar (with backdrop blur, dark theme to match). Receives `count`, `clientName`, `submitting`, `onCancel`, `onConfirm`. Confirm disabled when `count === 0` or `submitting === true`.

### Modified files

- **`src/components/orders/OrdersTable.tsx`** — accept three new props: `selectMode: boolean`, `selectedIds: Set<string>`, `onToggleSelect: (id: string) => void`, `onToggleSelectAll: () => void`. Render checkbox column when `selectMode`. Suppress row `onClick` and hide trash button while `selectMode`. Header checkbox is checked when all unassigned rows are selected; indeterminate when some.
- **`src/app/reports/[id]/ReportDetailClient.tsx`** — owns the assign-flow state (`mode`, `client`, `selectedIds`). Renders `<AssignClientButton>` next to "Add Manually". Hides both "Add Manually" and "Assign Client" trigger buttons while in `selecting`/`submitting` (the action bar is the only UI). Mounts `<AssignClientPopup>` when `mode === 'picker'` and `<SelectActionBar>` when `mode === 'selecting' | 'submitting'`. Passes `selectMode`/`selectedIds`/`onToggleSelect`/`onToggleSelectAll` to `OrdersTable`. Drops the local `useState(initialOrders)` (see Refactor section).
- **`src/actions/orders.ts`** — add `assignOrdersToClient` (signature below).

## Server Action

```ts
// src/actions/orders.ts
export async function assignOrdersToClient(
  orderIds: string[],
  clientId: string,
  reportId: string
): Promise<{ updatedCount: number }> {
  if (orderIds.length === 0) return { updatedCount: 0 }
  const supabase = await createClient()

  // Ensure report_clients row exists for this report+client (default %)
  await supabase
    .from('report_clients')
    .upsert(
      { report_id: reportId, client_id: clientId, commission_percent: DEFAULT_COMMISSION_PERCENT },
      { onConflict: 'report_id,client_id', ignoreDuplicates: true }
    )

  // Defensive: only update orders that are still unassigned, so concurrent
  // assignments from another tab don't get overwritten.
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

`updatedCount` lets the toast distinguish the rare race case ("Assigned 5 of 7 orders (2 already had clients)") from the common case ("Assigned 5 orders"). Mirrors the `report_clients` upsert in existing `createOrder`/`updateOrder`.

## Required Refactor: drop local `orders` state in `ReportDetailClient`

The user picked `router.refresh()` as the post-assign refresh strategy. Today `ReportDetailClient` does:

```ts
const [orders, setOrders] = useState(initialOrders)
```

`router.refresh()` re-renders the server component and passes a fresh `initialOrders` prop, but `useState` does not re-init from prop changes. So a refresh alone would not update the rendered table.

**Fix:** remove the local state, render directly from `initialOrders`. Existing `onDeleteSuccess` and `onEditSuccess` handlers become `() => router.refresh()`. This is a ~20-line behavioral change with two side effects:

1. Every successful action triggers a server roundtrip — the "tiny visual flash" accepted in the Option A decision.
2. **Incidentally fixes the existing `OrderModal` stale-`clients.name` bug** — that bug exists because the spread-into-state path doesn't update the joined client row. With local state gone, the path doesn't exist.

`pendingOrders` (parsed-but-not-yet-saved orders) stays as-is — it's purely client-side and orthogonal. `PendingOrdersReview`'s `onSaved` callback calls `router.refresh()` instead of merging into local state.

## Edge Cases

- **No unassigned orders when triggering** — toast `"All orders already have a client assigned"`, stay in idle, don't open the picker.
- **0 selected at submit time** — Confirm is disabled, can't fire.
- **Concurrent assignment in another tab** — handled by the `.is('client_id', null)` guard. The result `updatedCount` may be less than `orderIds.length`; the toast surfaces that.
- **Network error mid-submit** — toast the error, return to `selecting` with selection preserved.
- **Client list empty** — the `<select>` shows only the placeholder option; Confirm in picker is disabled while `client === null`. (Edge case unlikely in practice — there's a Create Client flow on `/clients`.)
- **Image upload completes during select mode** — orthogonal, no interaction. The newly parsed orders only enter the orders table after the user saves them via `PendingOrdersReview`, which exits to idle naturally because `router.refresh()` runs after save.

## Out of Scope

- **Reassigning already-assigned orders in bulk** — single-order edit via row click already supports reassignment. A bulk "reassign" mode would need its own UX (which assignee to filter by, etc.).
- **Selection across reports** — this feature is per-report only.
- **Optimistic UI for the bulk update** — Option A (router.refresh) was explicitly chosen over Option C (optimistic + refresh).
- **Filters in the picker / select mode** — small selection sets, YAGNI.

## Testing

- Unit: `assignOrdersToClient` with empty array returns `{ updatedCount: 0 }` without a DB call.
- Unit: `assignOrdersToClient` filters out orders that already have a client (the `.is('client_id', null)` guard).
- Manual: full happy path, cancel from picker, cancel from select mode, error during submit, "all orders assigned" toast.
