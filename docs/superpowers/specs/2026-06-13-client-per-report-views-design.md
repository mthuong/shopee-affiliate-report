# Client Per-Report Views

**Date:** 2026-06-13
**Status:** Approved design

## Summary

Two related changes to the clients pages, both organized around showing
commission/return **per report** rather than as a single lump:

1. **`/clients` list** — each client card shows a per-report breakdown (commission
   & return per report), newest first, capped at 3 rows with a "+N more reports"
   indicator. The single aggregate total is removed from the card.
2. **`/clients/[id]` detail** — paginate the report sections, loading 2 reports at
   a time via a "Load more" button, so each request fetches far less data.

Both are driven by one shared pure helper that groups a client's completed orders
by report.

## Background (not a bug)

Investigation confirmed the existing totals are computed correctly: `getClients`
already applies each report's `commission_percent` per order when summing
`total_return`. This work is a presentation/bandwidth change, not a defect fix.

Relevant current code:
- `src/actions/clients.ts` `getClients()` — returns each client with aggregate
  `total_commission` / `total_return`, computed from a nested
  `orders(commission, report_id, status_id)` + `report_clients(commission_percent,
  report_id)` select.
- `src/components/clients/ClientCard.tsx` — renders the two aggregate numbers; the
  whole card is a `<Link>` to `/clients/[id]`.
- `src/app/clients/[id]/page.tsx` — server component that loads ALL of the client's
  orders (`getOrdersByClient`), then per report runs `getReport` + `getReportClient`,
  plus a heavy `getClients()` (all clients) only to populate the reassignment
  dropdown. Renders a top totals summary + one `ClientMonthSection` per report.
- `src/lib/utils/commission.ts` — pure helpers `calcReturn`, `calcSubtotal`,
  `calcTotalReturn`; `COMPLETED_STATUS_ID = 1`, `DEFAULT_COMMISSION_PERCENT = 50`.

## Decisions

| Question | Decision |
|---|---|
| Card: aggregate vs breakdown | **Per-report rows only** (no grand total on the card) |
| Card: click target | **Whole card → client detail**; rows are display-only |
| Card: max rows | **3**, newest first, with **"+N more reports"** when more exist |
| Card: empty client | Muted **"No orders yet"** row |
| Detail: pagination size | **2 reports per page** |
| Detail: mechanism | **"Load more" button** (incremental append via server action) |
| List data approach | **Extend `getClients`** + a pure breakdown helper (chosen over a new duplicate action or client-side computation) |

## Section 1 — Shared logic & data layer

### `buildClientReportBreakdown` (new, pure)

Location: `src/lib/utils/commission.ts`.

```
buildClientReportBreakdown(orders, reportClients) -> ReportBreakdown[]
```

- `orders`: array of `{ commission, report_id, status_id, reports: { id, name, created_at } | null }`.
- `reportClients`: array of `{ commission_percent, report_id }`.
- Logic: filter to completed orders (`status_id === COMPLETED_STATUS_ID`); group by
  `report_id`; for each group produce
  `{ report_id, report_name, created_at, commission, return }` where
  `commission` = Σ group commission and
  `return` = `calcReturn(commission, percentForReport ?? DEFAULT_COMMISSION_PERCENT)`
  (percent looked up from `reportClients` by `report_id`).
- Sort by `created_at` **descending** (newest first).
- Orders whose `reports` is null are skipped (no report to attribute to).

A client's grand totals derive from the breakdown:
`totalCommission = Σ b.commission`, `totalReturn = Σ b.return`.

### `ReportBreakdown` type (new)

In `src/lib/supabase/types.ts`:
```
ReportBreakdown = {
  report_id: string
  report_name: string
  created_at: string
  commission: number
  return: number
}
```

### `getClients()` reshape

`src/actions/clients.ts` — extend the nested select to include report names:
`orders(commission, report_id, status_id, reports(id, name, created_at)), report_clients(commission_percent, report_id)`.
Return each client as `Client & { reports: ReportBreakdown[] }` (built via
`buildClientReportBreakdown`). The single aggregate `total_commission` /
`total_return` fields are removed (the card no longer shows them); update the
`ClientWithTotals` type accordingly (rename/replace with the new shape, e.g.
`ClientWithReports`).

## Section 2 — `/clients` list card

`src/components/clients/ClientCard.tsx`:
- Client name at top; whole card stays a `<Link href={/clients/${id}}>`.
- Render `client.reports.slice(0, 3)` as rows: `report_name · commission · return`,
  reusing the existing green (commission) / orange (return) styling and `formatVND`.
- If `client.reports.length > 3`: a muted `+{length - 3} more reports` line.
- If `client.reports.length === 0`: a muted `No orders yet` row.
- Rows are display-only (no per-row links).

`src/app/clients/page.tsx` is unchanged except for the updated client type.

## Section 3 — `/clients/[id]` detail pagination

Goal: load only 2 reports' full order detail per request.

### Initial server render (`clients/[id]/page.tsx`)

1. **Lightweight client-scoped query** selecting minimal columns
   (`orders(commission, report_id, status_id, reports(id, name, created_at)),
   report_clients(commission_percent, report_id)` for this client) →
   `buildClientReportBreakdown` yields:
   - the ordered report list (id, name, created_at, percent) used to drive paging, and
   - the top-of-page **Total Commission / Total Return** (sum of the breakdown).
   This keeps the grand totals correct without loading every report's full orders.
2. Fetch **full** order detail (with statuses, product names) for only the **first 2**
   reports → initial `ClientMonthSection`s. The percent for each comes from the
   breakdown.
3. `getOrderStatuses()` + a **lightweight** client list (`id, name` only) for the
   order-reassignment dropdown, replacing today's heavy `getClients()` call here.

### "Load more" (`ClientDetailClient.tsx`)

- Becomes stateful: holds the loaded `ReportGroup[]` and the full ordered report
  list (id + name + created_at + percent).
- A **"Load more"** button is shown while unloaded reports remain. Clicking calls a
  new server action **`getClientReportGroups(clientId, reportIds: string[])`** with
  the next 2 report IDs; it returns full `ReportGroup`s (report, orders-with-status,
  commissionPercent) which are appended to state. The button hides once all reports
  are loaded.
- `ClientMonthSection` is unchanged.

### New action

`getClientReportGroups(clientId, reportIds)` in `src/actions/clients.ts`: for each
report id, fetch that client's orders in that report (with
statuses) and the `commission_percent`, returning `ReportGroup[]` ordered to match
the requested ids.

## Section 4 — Testing

- **`buildClientReportBreakdown`** (`src/lib/utils/__tests__/commission.test.ts`):
  groups by report; per-report commission sum; per-report return using each report's
  percent and the default (50) when no `report_clients` row; completed-only filter;
  newest-first ordering; orders with null `reports` skipped; empty input → `[]`.
- **`ClientCard`** (`src/components/clients/__tests__/ClientCard.test.tsx`): shows 3
  rows + `+N more reports` when >3; shows `No orders yet` when the client has no
  reports; renders commission/return values.
- **`ClientDetailClient` "Load more"**
  (`src/app/clients/[id]/__tests__/ClientDetailClient.test.tsx` or a colocated test):
  with a mocked `getClientReportGroups`, renders 2 sections initially, clicking
  appends the next 2, and the button disappears when no reports remain.

## Out of scope / future

- Per-row links from the card to individual reports.
- Configurable page size or "Load all" on the detail page.
- Server-side aggregate (SQL `sum`/RPC) for client totals — current per-client
  minimal-column scan is sufficient and far lighter than today's full load.
- Pagination on the `/clients` list itself.
