# CSV Import — Shopee Affiliate Commission Report

**Date:** 2026-06-13
**Status:** Approved design

## Summary

Add the ability to import orders into a report from Shopee's official
**Affiliate Commission Report** CSV export, alongside the existing screenshot
(Gemini AI) import. The CSV is parsed in the browser into `ParsedOrder[]` and
fed into the existing pending-review → save pipeline, so editing, status
resolution, duplicate-skipping, and the saved/skipped toast are all reused
unchanged.

## Goals

- Let a user upload a Shopee Affiliate Commission Report CSV on the report
  detail page and review/save its orders.
- Reuse the existing `PendingOrdersReview` → `createOrders` flow end to end.
- Add no new dependencies and no new server action.

## Non-goals

- Replacing or removing the screenshot/Gemini import (both coexist).
- Auto-assigning clients from CSV columns (`Sub_id*`, `Channel`). Orders import
  unassigned, exactly like screenshots; clients are assigned manually afterward.
- Server-side parsing or file upload (the CSV holds no secrets).

## Source data

File: `docs/AffiliateCommissionReport_202606131203.csv` — Shopee's affiliate
commission export.

- ~47 columns, UTF-8 with BOM, `₫`-suffixed money headers, quoted product names
  that contain commas.
- **One row per item.** A single order with N items produces N rows sharing one
  `Order id`. The sample file has 48 item rows across 31 distinct orders.
- Order-level money columns (`Total Order Commission(₫)`, `Affiliate Net
  Commission(₫)`) carry the order total on the order's **first** item row and
  `0` on the remaining rows. Summing the column across a group therefore yields
  the true order total.
- `Order Status` values in the sample: `Completed` (47 rows), `Cancelled` (1).

## Decisions

| Question | Decision |
|---|---|
| Relationship to screenshot import | **Add alongside** — both feed the same review/save flow |
| Multi-item → one order | **Sum commission, join item names** with `; ` |
| Which commission column | **`Total Order Commission(₫)`** |
| Status mapping | **Map English → Vietnamese**, unknown statuses pass through verbatim |
| Cancelled / zero-commission orders | **Import all, show status** (user can delete in review) |
| Parse location | **Client-side**, using SheetJS (`xlsx`, already a dependency) |

## Architecture

```
CsvUploader (new)  ──file──▶  parseAffiliateCsv(input)  (new util)
                                       │  ParsedOrder[]
                                       ▼
ReportDetailClient.appendParsed()  ──▶  pendingOrders state
                                       ▼
PendingOrdersReview  ──▶  resolveStatusId + createOrders   (existing, unchanged)
                                       ▼
                              orders table (dedup on report_id + order_id)
```

### New units

1. **`src/lib/csv/parse-affiliate-csv.ts`** — pure function
   `parseAffiliateCsv(input: string | ArrayBuffer): ParsedOrder[]`. No React, no
   Supabase. Fully unit-testable.
2. **`src/components/reports/CsvUploader.tsx`** — `.csv` file input that calls
   the parser and hands results to `onParsed`, mirroring `ImageUploader`.

### Touched unit

3. **`src/app/reports/[id]/ReportDetailClient.tsx`** — render
   `<CsvUploader onParsed={appendParsed} />` next to `<ImageUploader />`.
   `appendParsed` already exists and is the correct entry point.

## Parsing module: `parseAffiliateCsv`

Signature: `parseAffiliateCsv(input: string | ArrayBuffer): ParsedOrder[]`

Steps:

1. **Tokenize** with SheetJS (`XLSX.read(input, { type })` →
   `XLSX.utils.sheet_to_json` with header row). Handles BOM, quoted commas, and
   `₫`-suffixed headers.
2. **Group rows by `Order id`.**
3. **Aggregate each group into one `ParsedOrder`:**
   - `order_id` ← `Order id`
   - `commission_vnd` ← sum of `Total Order Commission(₫)` across the group's
     rows, then `Math.round` (values can be fractional, e.g. `68072.4`; the DB
     column is `bigint` dong).
   - `product_name` ← non-blank `Item Name` values joined with `; `; if none,
     `null`.
   - `status_name` ← map `Order Status`: `Completed → Đã hoàn thành`,
     `Cancelled → Đã hủy`. Unknown value passes through verbatim (review
     dropdown flags it; `resolveStatusId` creates it on save). Taken from the
     group's first row (order-level / consistent).
   - `ordered_at` ← `Order Time` of the first row, normalized to a `new Date()`-
     parseable string (`"2026-05-20 08:57:20"` → `"2026-05-20T08:57:20"`,
     interpreted as the user's local time — same as today's screenshot flow).
4. **Return all groups** (including cancelled / zero-commission), sorted by
   `ordered_at` descending to match the orders table ordering.

### Edge cases

- Missing/empty `Order id` → row skipped (cannot key an order).
- Commission cell blank or non-numeric → treated as `0`.
- A required header missing (wrong file) → throw
  `Error("This doesn't look like a Shopee affiliate commission CSV.")`.
- Cross-upload duplicate order IDs are handled later by `createOrders` dedup
  (`onConflict: report_id,order_id`); the parser does not dedup against the DB.

## UI component: `CsvUploader`

Client component mirroring `ImageUploader`, placed beside it on the report page.

- Labeled file input restricted to `.csv` (`accept=".csv,text/csv"`).
- On select: `file.arrayBuffer()` → `parseAffiliateCsv` → `onParsed(orders)`.
- Inline state: parsing → `"Parsed N orders from <filename>"`, or an error
  message on failure.
- Resets the input after handling so the same file can be re-selected.
- Hint text: "Upload the Affiliate Commission Report CSV exported from Shopee."
- No queue/cropper machinery (screenshot-specific). Parsing is synchronous and
  instant; results go straight to the pending-review table. Existing **Save
  All / Discard** buttons handle the rest.

## Error handling

- **Wrong file / missing headers** → parser throws; `CsvUploader` catches and
  shows "This doesn't look like a Shopee affiliate commission CSV." Nothing
  added to pending.
- **Empty CSV (headers only)** → `onParsed([])`, inline "No orders found in this
  file."
- **Malformed individual rows** (blank order id, non-numeric commission) →
  handled inside the parser (skip / coerce to 0), not fatal.
- **Save-time failures** (duplicates, DB errors) → existing
  `PendingOrdersReview` toast + skipped-count logic, unchanged.

## Testing

- **`src/lib/csv/__tests__/parse-affiliate-csv.test.ts`** (primary) — unit tests
  against representative CSV fixtures:
  - multi-item order → single `ParsedOrder` with summed commission + joined names
  - fractional commission rounds correctly
  - `Completed`/`Cancelled` → Vietnamese mapping; unknown status passes through
  - cancelled & zero-commission orders are included
  - blank order id skipped; blank commission → 0
  - missing required header → throws
  - a small fixture derived from the real file locking in 48 rows → 31 orders
- **`src/components/reports/__tests__/CsvUploader.test.tsx`** — renders, accepts
  a file, calls `onParsed` with parsed results; shows error on a bad file.
- Uses the existing Jest + Testing Library setup.

## Out of scope / future

- Mapping `Sub_id*` / `Channel` columns to auto-assign clients.
- Importing from the `.xlsx` variant of the report (SheetJS would support it,
  but not requested).
- Timezone-explicit parsing of `Order Time` (currently local-time, matching the
  screenshot flow).
