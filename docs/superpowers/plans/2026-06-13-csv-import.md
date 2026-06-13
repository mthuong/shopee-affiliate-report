# CSV Import (Shopee Affiliate Commission Report) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import orders into a report by uploading Shopee's Affiliate Commission Report CSV, reusing the existing pending-review → save pipeline.

**Architecture:** A pure browser-side parser (`parseAffiliateCsv`) turns the per-item CSV into per-order `ParsedOrder[]` using SheetJS (already a dependency). A small `CsvUploader` component feeds those results into `ReportDetailClient.appendParsed` — the same entry point Gemini's screenshot output uses. No server action, no schema change.

**Tech Stack:** Next.js 16, React 19, TypeScript, SheetJS (`xlsx`), Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-13-csv-import-design.md`

---

## File Structure

- **Create** `src/lib/csv/parse-affiliate-csv.ts` — pure function `parseAffiliateCsv(input: string | ArrayBuffer): ParsedOrder[]`. Tokenize with SheetJS, group rows by `Order id`, aggregate into one `ParsedOrder` per order. No React, no Supabase.
- **Create** `src/lib/csv/__tests__/parse-affiliate-csv.test.ts` — unit tests for the parser.
- **Create** `src/components/reports/CsvUploader.tsx` — `.csv` file input that calls the parser and hands results to `onParsed`. Mirrors `ImageUploader`.
- **Create** `src/components/reports/__tests__/CsvUploader.test.tsx` — component tests.
- **Modify** `src/app/reports/[id]/ReportDetailClient.tsx` — render `<CsvUploader onParsed={appendParsed} />` next to `<ImageUploader />`.

The parser reads only five columns, so test fixtures use a minimal 5-column CSV (`Order id,Order Status,Order Time,Item Name,Total Order Commission(₫)`) — SheetJS keys rows by header name, so extra real-world columns are irrelevant to the logic.

---

## Task 1: CSV parsing module

**Files:**
- Create: `src/lib/csv/parse-affiliate-csv.ts`
- Test: `src/lib/csv/__tests__/parse-affiliate-csv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/csv/__tests__/parse-affiliate-csv.test.ts`:

```ts
import { parseAffiliateCsv } from '../parse-affiliate-csv'

const HEADER = 'Order id,Order Status,Order Time,Item Name,Total Order Commission(₫)'

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n')
}

describe('parseAffiliateCsv', () => {
  it('collapses a multi-item order into one ParsedOrder (sum commission, join names)', () => {
    const result = parseAffiliateCsv(
      csv(
        '260520UCS3B5DP,Completed,2026-05-20 08:57:20,Item A,14560',
        '260520UCS3B5DP,Completed,2026-05-20 08:57:20,Item B,0',
      ),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      order_id: '260520UCS3B5DP',
      product_name: 'Item A; Item B',
      status_name: 'Đã hoàn thành',
      commission_vnd: 14560,
      ordered_at: '2026-05-20T08:57:20',
    })
  })

  it('rounds fractional commission to the nearest dong', () => {
    const result = parseAffiliateCsv(csv('ORD1,Completed,2026-05-01 10:00:00,X,68072.4'))
    expect(result[0].commission_vnd).toBe(68072)
  })

  it('maps Cancelled to Đã hủy and still includes the order', () => {
    const result = parseAffiliateCsv(csv('ORD2,Cancelled,2026-05-02 10:00:00,Y,0'))
    expect(result).toHaveLength(1)
    expect(result[0].status_name).toBe('Đã hủy')
  })

  it('passes an unknown status through verbatim', () => {
    const result = parseAffiliateCsv(csv('ORD3,Pending,2026-05-03 10:00:00,Z,5000'))
    expect(result[0].status_name).toBe('Pending')
  })

  it('skips rows with a blank Order id', () => {
    const result = parseAffiliateCsv(csv(',Completed,2026-05-04 10:00:00,W,1000'))
    expect(result).toHaveLength(0)
  })

  it('treats a blank commission cell as 0', () => {
    const result = parseAffiliateCsv(csv('ORD4,Completed,2026-05-05 10:00:00,V,'))
    expect(result[0].commission_vnd).toBe(0)
  })

  it('uses null product_name when no item names are present', () => {
    const result = parseAffiliateCsv(csv('ORD5,Completed,2026-05-06 10:00:00,,1000'))
    expect(result[0].product_name).toBeNull()
  })

  it('preserves commas inside quoted item names', () => {
    const result = parseAffiliateCsv(csv('ORD6,Completed,2026-05-07 10:00:00,"Áo sọc, 2 lớp",2000'))
    expect(result[0].product_name).toBe('Áo sọc, 2 lớp')
  })

  it('sorts orders by ordered_at descending', () => {
    const result = parseAffiliateCsv(
      csv(
        'OLD,Completed,2026-05-01 10:00:00,A,1000',
        'NEW,Completed,2026-05-09 10:00:00,B,2000',
      ),
    )
    expect(result.map((o) => o.order_id)).toEqual(['NEW', 'OLD'])
  })

  it('groups many item rows into the correct number of orders', () => {
    const result = parseAffiliateCsv(
      csv(
        'A,Completed,2026-05-01 10:00:00,a1,100',
        'A,Completed,2026-05-01 10:00:00,a2,0',
        'B,Completed,2026-05-02 10:00:00,b1,200',
        'C,Cancelled,2026-05-03 10:00:00,c1,0',
        'C,Cancelled,2026-05-03 10:00:00,c2,0',
      ),
    )
    expect(result).toHaveLength(3)
  })

  it('throws when a required header is missing (wrong file)', () => {
    const wrong = 'Foo,Bar\n1,2'
    expect(() => parseAffiliateCsv(wrong)).toThrow(/Shopee affiliate commission CSV/)
  })

  it('returns an empty array for a header-only file', () => {
    expect(parseAffiliateCsv(HEADER)).toEqual([])
  })

  it('accepts an ArrayBuffer input', () => {
    const bytes = new TextEncoder().encode(csv('ORD7,Completed,2026-05-08 10:00:00,Q,300'))
    const result = parseAffiliateCsv(bytes.buffer)
    expect(result).toHaveLength(1)
    expect(result[0].order_id).toBe('ORD7')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parse-affiliate-csv`
Expected: FAIL — `Cannot find module '../parse-affiliate-csv'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/csv/parse-affiliate-csv.ts`:

```ts
import * as XLSX from 'xlsx'
import type { ParsedOrder } from '@/lib/supabase/types'

const STATUS_MAP: Record<string, string> = {
  Completed: 'Đã hoàn thành',
  Cancelled: 'Đã hủy',
}

const COL = {
  orderId: 'Order id',
  status: 'Order Status',
  time: 'Order Time',
  itemName: 'Item Name',
  commission: 'Total Order Commission(₫)',
} as const

const REQUIRED_HEADERS = Object.values(COL)

type Row = Record<string, unknown>

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function normalizeDate(value: unknown): string {
  // "2026-05-20 08:57:20" -> "2026-05-20T08:57:20" (parseable by `new Date()`)
  return String(value ?? '').trim().replace(' ', 'T')
}

export function parseAffiliateCsv(input: string | ArrayBuffer): ParsedOrder[] {
  const wb =
    typeof input === 'string'
      ? XLSX.read(input, { type: 'string' })
      : XLSX.read(new Uint8Array(input), { type: 'array' })

  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: '', raw: false })

  if (rows.length === 0) return []

  const headers = Object.keys(rows[0])
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    throw new Error("This doesn't look like a Shopee affiliate commission CSV.")
  }

  const groups = new Map<string, Row[]>()
  const order: string[] = []
  for (const row of rows) {
    const id = String(row[COL.orderId] ?? '').trim()
    if (!id) continue
    if (!groups.has(id)) {
      groups.set(id, [])
      order.push(id)
    }
    groups.get(id)!.push(row)
  }

  const result: ParsedOrder[] = order.map((id) => {
    const items = groups.get(id)!
    const commission_vnd = Math.round(
      items.reduce((sum, r) => sum + toNumber(r[COL.commission]), 0),
    )
    const names = items
      .map((r) => String(r[COL.itemName] ?? '').trim())
      .filter((n) => n.length > 0)
    const first = items[0]
    const rawStatus = String(first[COL.status] ?? '').trim()
    return {
      order_id: id,
      product_name: names.length > 0 ? names.join('; ') : null,
      status_name: STATUS_MAP[rawStatus] ?? rawStatus,
      commission_vnd,
      ordered_at: normalizeDate(first[COL.time]),
    }
  })

  result.sort((a, b) =>
    a.ordered_at < b.ordered_at ? 1 : a.ordered_at > b.ordered_at ? -1 : 0,
  )
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- parse-affiliate-csv`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/parse-affiliate-csv.ts src/lib/csv/__tests__/parse-affiliate-csv.test.ts
git commit -m "feat: parse Shopee affiliate commission CSV into ParsedOrder[]"
```

---

## Task 2: CsvUploader component

**Files:**
- Create: `src/components/reports/CsvUploader.tsx`
- Test: `src/components/reports/__tests__/CsvUploader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/__tests__/CsvUploader.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CsvUploader } from '../CsvUploader'

jest.mock('@/lib/csv/parse-affiliate-csv', () => ({
  __esModule: true,
  parseAffiliateCsv: jest.fn(),
}))

import { parseAffiliateCsv } from '@/lib/csv/parse-affiliate-csv'
const mockParse = parseAffiliateCsv as jest.Mock

// jsdom's File has no arrayBuffer() — polyfill it for the component under test.
beforeAll(() => {
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function () {
      return Promise.resolve(new ArrayBuffer(0))
    }
  }
})

beforeEach(() => {
  mockParse.mockReset()
})

function selectFile() {
  const input = screen.getByTestId('csv-input') as HTMLInputElement
  const file = new File(['dummy'], 'report.csv', { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('CsvUploader', () => {
  it('calls onParsed with parsed orders and shows a success message', async () => {
    const orders = [
      { order_id: 'A', product_name: 'X', status_name: 'Đã hoàn thành', commission_vnd: 100, ordered_at: '2026-05-01T10:00:00' },
    ]
    mockParse.mockReturnValue(orders)
    const onParsed = jest.fn()
    render(<CsvUploader onParsed={onParsed} />)

    selectFile()

    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(orders))
    expect(screen.getByText(/Parsed 1 order from report\.csv/)).toBeInTheDocument()
  })

  it('shows "No orders found" when the parser returns an empty array', async () => {
    mockParse.mockReturnValue([])
    const onParsed = jest.fn()
    render(<CsvUploader onParsed={onParsed} />)

    selectFile()

    await waitFor(() => expect(onParsed).toHaveBeenCalledWith([]))
    expect(screen.getByText(/No orders found/)).toBeInTheDocument()
  })

  it('shows an error message and does not call onParsed when parsing throws', async () => {
    mockParse.mockImplementation(() => {
      throw new Error("This doesn't look like a Shopee affiliate commission CSV.")
    })
    const onParsed = jest.fn()
    render(<CsvUploader onParsed={onParsed} />)

    selectFile()

    await waitFor(() =>
      expect(screen.getByText(/doesn't look like a Shopee affiliate commission CSV/)).toBeInTheDocument(),
    )
    expect(onParsed).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CsvUploader`
Expected: FAIL — `Cannot find module '../CsvUploader'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/reports/CsvUploader.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { parseAffiliateCsv } from '@/lib/csv/parse-affiliate-csv'
import type { ParsedOrder } from '@/lib/supabase/types'

type Props = {
  onParsed: (orders: ParsedOrder[]) => void
}

export function CsvUploader({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const orders = parseAffiliateCsv(buffer)
      onParsed(orders)
      setMessage(
        orders.length > 0
          ? `Parsed ${orders.length} order${orders.length === 1 ? '' : 's'} from ${file.name}`
          : 'No orders found in this file.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center">
      <input
        ref={inputRef}
        data-testid="csv-input"
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="text-sm text-orange-400 border border-orange-500/40 px-4 py-2 rounded-lg hover:bg-orange-500/10"
      >
        📄 Import from CSV
      </button>
      <p className="text-gray-600 text-xs mt-2">
        Upload the Affiliate Commission Report CSV exported from Shopee.
      </p>
      {message && <p className="text-green-400 text-xs mt-2">{message}</p>}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CsvUploader`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/CsvUploader.tsx src/components/reports/__tests__/CsvUploader.test.tsx
git commit -m "feat: add CsvUploader component for affiliate CSV import"
```

---

## Task 3: Wire CsvUploader into the report page

**Files:**
- Modify: `src/app/reports/[id]/ReportDetailClient.tsx`

- [ ] **Step 1: Add the import**

In `src/app/reports/[id]/ReportDetailClient.tsx`, add this import next to the existing `ImageUploader` import (currently line 5):

```tsx
import { CsvUploader } from '@/components/reports/CsvUploader'
```

- [ ] **Step 2: Render the uploader**

Find this block (currently around line 173–176):

```tsx
      <ImageUploader onFilesSelected={addFiles} pendingCount={queue.length} />

      <UploadQueue items={queue} onUpdate={updateItem} onRemove={removeItem} onClearAll={clearQueue} onParsed={appendParsed} />
```

Insert the CSV uploader directly below the `ImageUploader` line so both import options sit together:

```tsx
      <ImageUploader onFilesSelected={addFiles} pendingCount={queue.length} />

      <div className="mt-3">
        <CsvUploader onParsed={appendParsed} />
      </div>

      <UploadQueue items={queue} onUpdate={updateItem} onRemove={removeItem} onClearAll={clearQueue} onParsed={appendParsed} />
```

`appendParsed` is the existing callback (defined ~line 77) that feeds parsed orders into the `pendingOrders` review table — the same one `UploadQueue` uses. No other changes are needed.

- [ ] **Step 3: Verify the full test suite passes**

Run: `npm test`
Expected: PASS — all suites green, including the new parser and component tests.

- [ ] **Step 4: Verify the production build compiles**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/reports/[id]/ReportDetailClient.tsx
git commit -m "feat: surface CSV import on the report detail page"
```

---

## Manual verification (after Task 3)

1. `npm run dev`, open a report at `/reports/<id>`.
2. Click **Import from CSV**, select `docs/AffiliateCommissionReport_202606131203.csv`.
3. Confirm the pending-review table shows 31 orders, the cancelled order has status **Đã hủy**, multi-item orders show joined product names, and commissions match `Total Order Commission` totals.
4. Click **Save All**; confirm orders appear in the Orders table and a re-import reports duplicates skipped.

---

## Self-Review

**Spec coverage:**
- Parser module, column mapping, per-order aggregation (sum `Total Order Commission`, join names), status mapping, edge cases → Task 1.
- `CsvUploader` component + error/empty handling → Task 2.
- Wiring into `ReportDetailClient` next to `ImageUploader` → Task 3.
- Testing (parser unit tests + component tests) → Tasks 1 & 2. Note: the spec's "48 rows → 31 orders" check is covered by an equivalent grouping test on a minimal inline fixture (Task 1, "groups many item rows…"), plus the manual verification step against the real file. This avoids depending on the untracked `docs/*.csv` in CI.

**Placeholder scan:** No TBD/TODO; every code step contains full code and exact commands.

**Type consistency:** `parseAffiliateCsv(input: string | ArrayBuffer): ParsedOrder[]` is used identically in Task 2's component and tests. `ParsedOrder` fields (`order_id`, `product_name`, `status_name`, `commission_vnd`, `ordered_at`) match `src/lib/supabase/types.ts`. `onParsed: (orders: ParsedOrder[]) => void` matches `appendParsed`'s signature in `ReportDetailClient`.
