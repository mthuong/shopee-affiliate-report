# Client Per-Report Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show commission/return per report on the `/clients` list (max 3 rows + "+N more"), and paginate the `/clients/[id]` detail page to load 2 reports at a time via "Load more".

**Architecture:** A pure helper `buildClientReportBreakdown` groups a client's completed orders by report. `getClients` returns each client with a `reports` breakdown for the card. The detail page loads a lightweight per-client summary (totals + report list) plus full order detail for only the first 2 reports; a "Load more" button fetches the next 2 via a server action.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Supabase, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-13-client-per-report-views-design.md`

---

## File Structure

- **Modify** `src/lib/supabase/types.ts` — add `ReportBreakdown` and `ReportGroup` types; replace `ClientWithTotals` with `ClientWithReports`.
- **Modify** `src/lib/utils/commission.ts` — add pure `buildClientReportBreakdown`.
- **Modify** `src/lib/utils/__tests__/commission.test.ts` — tests for the helper.
- **Modify** `src/actions/clients.ts` — reshape `getClients` to return `reports`; add `getClientReportSummary`, `getClientReportGroups`, `getClientsBasic`.
- **Modify** `src/components/clients/ClientCard.tsx` — render up to 3 report rows + "+N more" / empty state.
- **Create** `src/components/clients/__tests__/ClientCard.test.tsx` — card render tests.
- **Modify** `src/app/clients/[id]/ClientDetailClient.tsx` — stateful "Load more" pagination.
- **Create** `src/app/clients/[id]/__tests__/ClientDetailClient.test.tsx` — load-more test.
- **Modify** `src/app/clients/[id]/page.tsx` — lightweight summary + first-2-reports initial render.

---

## Task 1: Pure breakdown helper + types

**Files:**
- Modify: `src/lib/supabase/types.ts`
- Modify: `src/lib/utils/commission.ts`
- Test: `src/lib/utils/__tests__/commission.test.ts`

- [ ] **Step 1: Add the `ReportBreakdown` type**

In `src/lib/supabase/types.ts`, add at the end:

```ts
export type ReportBreakdown = {
  report_id: string
  report_name: string
  created_at: string
  commission: number
  return: number
}

export type ClientWithReports = Client & {
  reports: ReportBreakdown[]
}
```

Then DELETE the existing `ClientWithTotals` type (it is replaced by `ClientWithReports`):

```ts
export type ClientWithTotals = Client & {
  total_commission: number
  total_return: number
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/lib/utils/__tests__/commission.test.ts`:

```ts
import { buildClientReportBreakdown } from '../commission'

describe('buildClientReportBreakdown', () => {
  const r1 = { id: 'r1', name: 'May 2026', created_at: '2026-05-01T00:00:00Z' }
  const r2 = { id: 'r2', name: 'Jun 2026', created_at: '2026-06-01T00:00:00Z' }

  it('groups completed orders by report and sums commission', () => {
    const orders = [
      { commission: 1000, status_id: 1, reports: r1 },
      { commission: 2000, status_id: 1, reports: r1 },
    ]
    const result = buildClientReportBreakdown(orders, [{ report_id: 'r1', commission_percent: 50 }])
    expect(result).toEqual([
      { report_id: 'r1', report_name: 'May 2026', created_at: '2026-05-01T00:00:00Z', commission: 3000, return: 1500 },
    ])
  })

  it('uses each report\'s own commission_percent for the return', () => {
    const orders = [
      { commission: 1000, status_id: 1, reports: r1 },
      { commission: 1000, status_id: 1, reports: r2 },
    ]
    const result = buildClientReportBreakdown(orders, [
      { report_id: 'r1', commission_percent: 20 },
      { report_id: 'r2', commission_percent: 80 },
    ])
    const byId = Object.fromEntries(result.map((b) => [b.report_id, b.return]))
    expect(byId).toEqual({ r1: 200, r2: 800 })
  })

  it('defaults to 50 percent when no report_clients row exists', () => {
    const orders = [{ commission: 1000, status_id: 1, reports: r1 }]
    const result = buildClientReportBreakdown(orders, [])
    expect(result[0].return).toBe(500)
  })

  it('excludes non-completed orders', () => {
    const orders = [
      { commission: 1000, status_id: 1, reports: r1 },
      { commission: 9999, status_id: 2, reports: r1 },
    ]
    const result = buildClientReportBreakdown(orders, [{ report_id: 'r1', commission_percent: 50 }])
    expect(result[0].commission).toBe(1000)
  })

  it('skips orders with no report', () => {
    const orders = [{ commission: 1000, status_id: 1, reports: null }]
    expect(buildClientReportBreakdown(orders, [])).toEqual([])
  })

  it('sorts reports newest-first by created_at', () => {
    const orders = [
      { commission: 1000, status_id: 1, reports: r1 },
      { commission: 1000, status_id: 1, reports: r2 },
    ]
    const result = buildClientReportBreakdown(orders, [])
    expect(result.map((b) => b.report_id)).toEqual(['r2', 'r1'])
  })

  it('returns an empty array for no orders', () => {
    expect(buildClientReportBreakdown([], [])).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- commission`
Expected: FAIL — `buildClientReportBreakdown is not a function` / not exported.

- [ ] **Step 4: Write the implementation**

In `src/lib/utils/commission.ts`, add the import at the top and the function at the end:

```ts
import type { ReportBreakdown } from '@/lib/supabase/types'
```

```ts
type BreakdownOrder = {
  commission: number
  status_id: number
  reports: { id: string; name: string; created_at: string } | null
}

export function buildClientReportBreakdown(
  orders: BreakdownOrder[],
  reportClients: { commission_percent: number; report_id: string }[]
): ReportBreakdown[] {
  const groups = new Map<string, { name: string; created_at: string; commission: number }>()
  for (const o of orders) {
    if (o.status_id !== COMPLETED_STATUS_ID) continue
    const r = o.reports
    if (!r) continue
    const existing = groups.get(r.id)
    if (existing) {
      existing.commission += o.commission
    } else {
      groups.set(r.id, { name: r.name, created_at: r.created_at, commission: o.commission })
    }
  }

  const result: ReportBreakdown[] = [...groups.entries()].map(([report_id, g]) => {
    const rc = reportClients.find((x) => x.report_id === report_id)
    const percent = rc?.commission_percent ?? DEFAULT_COMMISSION_PERCENT
    return {
      report_id,
      report_name: g.name,
      created_at: g.created_at,
      commission: g.commission,
      return: calcReturn(g.commission, percent),
    }
  })

  result.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  )
  return result
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- commission`
Expected: PASS — all `buildClientReportBreakdown` cases green (existing `calcReturn`/`calcSubtotal`/`calcTotalReturn` tests still pass).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/types.ts src/lib/utils/commission.ts src/lib/utils/__tests__/commission.test.ts
git commit -m "feat: add buildClientReportBreakdown helper and ReportBreakdown type"
```

---

## Task 2: Reshape `getClients` + add detail-page actions

**Files:**
- Modify: `src/actions/clients.ts`
- Modify: `src/lib/supabase/types.ts` (add `ReportGroup`)

- [ ] **Step 1: Add the `ReportGroup` type**

In `src/lib/supabase/types.ts`, add at the end:

```ts
export type ReportGroup = {
  report: Report
  orders: OrderWithStatus[]
  commissionPercent: number
}
```

(`Report` and `OrderWithStatus` are already defined in this file.)

- [ ] **Step 2: Reshape `getClients` and add the new actions**

Replace the entire body of `src/actions/clients.ts` with:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { buildClientReportBreakdown, DEFAULT_COMMISSION_PERCENT } from '@/lib/utils/commission'
import type { Client, ClientWithReports, ReportBreakdown, ReportGroup, OrderWithStatus } from '@/lib/supabase/types'

const CLIENT_BREAKDOWN_SELECT =
  '*, orders(commission, report_id, status_id, reports(id, name, created_at)), report_clients(commission_percent, report_id)'

export async function getClients(): Promise<ClientWithReports[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_BREAKDOWN_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    reports: buildClientReportBreakdown(c.orders ?? [], c.report_clients ?? []),
  }))
}

// Lightweight per-client summary: ordered report breakdown (drives the detail
// page's totals + pagination) without loading full order detail.
export async function getClientReportSummary(clientId: string): Promise<ReportBreakdown[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_BREAKDOWN_SELECT)
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw error
  if (!data) return []
  return buildClientReportBreakdown(data.orders ?? [], data.report_clients ?? [])
}

// Full order detail for a page of reports. Returns ReportGroups ordered to match
// the requested reportIds.
export async function getClientReportGroups(
  clientId: string,
  reportIds: string[]
): Promise<ReportGroup[]> {
  if (reportIds.length === 0) return []
  const supabase = await createSupabaseClient()

  const [{ data: orders, error: ordersError }, { data: rcs, error: rcError }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, order_statuses(*), reports(id, name, created_at)')
      .eq('client_id', clientId)
      .in('report_id', reportIds)
      .order('ordered_at', { ascending: false }),
    supabase
      .from('report_clients')
      .select('report_id, commission_percent')
      .eq('client_id', clientId)
      .in('report_id', reportIds),
  ])

  if (ordersError) throw ordersError
  if (rcError) throw rcError

  const percentByReport = new Map<string, number>(
    (rcs ?? []).map((r) => [r.report_id, r.commission_percent])
  )

  return reportIds
    .map((id) => {
      const group = (orders ?? []).filter((o) => o.report_id === id)
      const reportObj = group[0]?.reports as { id: string; name: string; created_at: string } | null
      if (!reportObj) return null
      return {
        report: reportObj,
        orders: group as OrderWithStatus[],
        commissionPercent: percentByReport.get(id) ?? DEFAULT_COMMISSION_PERCENT,
      }
    })
    .filter((g): g is ReportGroup => g !== null)
}

// Minimal client list for the order-reassignment dropdown.
export async function getClientsBasic(): Promise<Client[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createClientRecord(name: string): Promise<Client> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) throw error
  revalidatePath('/clients')
  return data
}

export async function deleteClientRecord(id: string): Promise<void> {
  const supabase = await createSupabaseClient()
  const { error } = await supabase.from('clients').delete().eq('id', id)

  if (error) throw error
  revalidatePath('/clients')
}
```

- [ ] **Step 3: Verify it type-checks and existing tests still pass**

Run: `npm test`
Expected: PASS — no test references the removed `ClientWithTotals`/old `getClients` shape yet (ClientCard is updated in Task 3). If TypeScript errors about `ClientWithTotals` appear, they will be in `ClientCard.tsx` (fixed next task) — proceed; the build is verified at the end of Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/actions/clients.ts src/lib/supabase/types.ts
git commit -m "feat: getClients returns per-report breakdown; add detail-page client actions"
```

---

## Task 3: `/clients` list card

**Files:**
- Modify: `src/components/clients/ClientCard.tsx`
- Test: `src/components/clients/__tests__/ClientCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/clients/__tests__/ClientCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { ClientCard } from '../ClientCard'
import type { ClientWithReports } from '@/lib/supabase/types'

function makeReport(id: string, name: string, created_at: string) {
  return { report_id: id, report_name: name, created_at, commission: 1000, return: 500 }
}

function client(reports: ClientWithReports['reports']): ClientWithReports {
  return { id: 'c1', name: 'Mie Closet', created_at: '2026-01-01T00:00:00Z', reports }
}

describe('ClientCard', () => {
  it('renders up to 3 report rows and a "+N more reports" line when there are more', () => {
    const reports = [
      makeReport('r4', 'Jun 2026', '2026-06-01T00:00:00Z'),
      makeReport('r3', 'May 2026', '2026-05-01T00:00:00Z'),
      makeReport('r2', 'Apr 2026', '2026-04-01T00:00:00Z'),
      makeReport('r1', 'Mar 2026', '2026-03-01T00:00:00Z'),
    ]
    render(<ClientCard client={client(reports)} />)
    expect(screen.getByText('Jun 2026')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('Apr 2026')).toBeInTheDocument()
    expect(screen.queryByText('Mar 2026')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more reports')).toBeInTheDocument()
  })

  it('renders all rows and no "+N more" line when there are 3 or fewer reports', () => {
    const reports = [makeReport('r1', 'Mar 2026', '2026-03-01T00:00:00Z')]
    render(<ClientCard client={client(reports)} />)
    expect(screen.getByText('Mar 2026')).toBeInTheDocument()
    expect(screen.queryByText(/more reports/)).not.toBeInTheDocument()
  })

  it('shows "No orders yet" when the client has no reports', () => {
    render(<ClientCard client={client([])} />)
    expect(screen.getByText('No orders yet')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ClientCard`
Expected: FAIL — current `ClientCard` renders aggregate totals, not report rows; `+1 more reports` / `No orders yet` not found (and a TS error on the removed `ClientWithTotals` type).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/components/clients/ClientCard.tsx` with:

```tsx
import Link from 'next/link'
import { formatVND } from '@/lib/utils/currency'
import type { ClientWithReports } from '@/lib/supabase/types'

const MAX_ROWS = 3

export function ClientCard({ client }: { client: ClientWithReports }) {
  const visible = client.reports.slice(0, MAX_ROWS)
  const extra = client.reports.length - visible.length

  return (
    <Link
      href={`/clients/${client.id}`}
      className="block bg-gray-900 border border-gray-800 hover:border-orange-500 rounded-xl p-5 cursor-pointer transition-colors"
    >
      <h3 className="text-white font-semibold text-lg mb-3">{client.name}</h3>

      {client.reports.length === 0 ? (
        <p className="text-gray-500 text-sm">No orders yet</p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((r) => (
            <div key={r.report_id} className="flex items-center justify-between text-sm">
              <span className="text-gray-300 truncate pr-3">{r.report_name}</span>
              <span className="flex gap-6 text-right whitespace-nowrap">
                <span className="text-green-400 font-medium">{formatVND(r.commission)}</span>
                <span className="text-orange-400 font-medium">{formatVND(r.return)}</span>
              </span>
            </div>
          ))}
          {extra > 0 && (
            <p className="text-gray-500 text-xs pt-1">+{extra} more reports</p>
          )}
        </div>
      )}
    </Link>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ClientCard`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ClientCard.tsx src/components/clients/__tests__/ClientCard.test.tsx
git commit -m "feat: show per-report breakdown on client cards"
```

---

## Task 4: Detail page "Load more" pagination (client component)

**Files:**
- Modify: `src/app/clients/[id]/ClientDetailClient.tsx`
- Test: `src/app/clients/[id]/__tests__/ClientDetailClient.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/clients/[id]/__tests__/ClientDetailClient.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ClientDetailClient } from '../ClientDetailClient'

jest.mock('@/actions/clients', () => ({
  __esModule: true,
  getClientReportGroups: jest.fn(),
}))

// ClientMonthSection pulls in server actions + toast; stub it to a simple marker
// so this test focuses on pagination behavior.
jest.mock('@/components/clients/ClientMonthSection', () => ({
  __esModule: true,
  ClientMonthSection: ({ report }: { report: { id: string; name: string } }) => (
    <div data-testid="month-section">{report.name}</div>
  ),
}))

import { getClientReportGroups } from '@/actions/clients'
const mockGet = getClientReportGroups as jest.Mock

const client = { id: 'c1', name: 'Mie Closet', created_at: '2026-01-01T00:00:00Z' }

function group(id: string, name: string) {
  return { report: { id, name, created_at: `${name}` }, orders: [], commissionPercent: 50 }
}

const reportList = [
  { report_id: 'r3', report_name: 'Jun', created_at: '2026-06-01T00:00:00Z', commission: 0, return: 0 },
  { report_id: 'r2', report_name: 'May', created_at: '2026-05-01T00:00:00Z', commission: 0, return: 0 },
  { report_id: 'r1', report_name: 'Apr', created_at: '2026-04-01T00:00:00Z', commission: 0, return: 0 },
]

beforeEach(() => mockGet.mockReset())

function renderComponent() {
  render(
    <ClientDetailClient
      client={client}
      clientId="c1"
      reportList={reportList}
      initialGroups={[group('r3', 'Jun'), group('r2', 'May')]}
      statuses={[]}
      allClients={[]}
      totalCommission={0}
      totalReturn={0}
    />
  )
}

describe('ClientDetailClient pagination', () => {
  it('renders the initial 2 report sections and a Load more button', () => {
    renderComponent()
    expect(screen.getAllByTestId('month-section')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument()
  })

  it('appends the next page and hides the button when all reports are loaded', async () => {
    mockGet.mockResolvedValue([group('r1', 'Apr')])
    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: /load more/i }))

    await waitFor(() => expect(screen.getAllByTestId('month-section')).toHaveLength(3))
    expect(mockGet).toHaveBeenCalledWith('c1', ['r1'])
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ClientDetailClient`
Expected: FAIL — current `ClientDetailClient` takes a `reportGroups` prop and has no Load more button.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/app/clients/[id]/ClientDetailClient.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { ClientMonthSection } from '@/components/clients/ClientMonthSection'
import { getClientReportGroups } from '@/actions/clients'
import { useToast } from '@/components/ui/Toast'
import { formatVND } from '@/lib/utils/currency'
import type { OrderStatus, Client, ReportBreakdown, ReportGroup } from '@/lib/supabase/types'

const PAGE_SIZE = 2

type Props = {
  client: Client
  clientId: string
  reportList: ReportBreakdown[]
  initialGroups: ReportGroup[]
  statuses: OrderStatus[]
  allClients: Client[]
  totalCommission: number
  totalReturn: number
}

export function ClientDetailClient({
  client,
  clientId,
  reportList,
  initialGroups,
  statuses,
  allClients,
  totalCommission,
  totalReturn,
}: Props) {
  const { showToast } = useToast()
  const [groups, setGroups] = useState<ReportGroup[]>(initialGroups)
  const [loading, setLoading] = useState(false)

  const hasMore = groups.length < reportList.length

  async function handleLoadMore() {
    setLoading(true)
    try {
      const nextIds = reportList
        .slice(groups.length, groups.length + PAGE_SIZE)
        .map((r) => r.report_id)
      const next = await getClientReportGroups(clientId, nextIds)
      setGroups((prev) => [...prev, ...next])
    } catch {
      showToast('Failed to load more reports', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{client.name}</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-1">Total Commission</p>
          <p className="text-green-400 text-2xl font-bold">{formatVND(totalCommission)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-1">Total Commission Return</p>
          <p className="text-orange-400 text-2xl font-bold">{formatVND(totalReturn)}</p>
        </div>
      </div>

      {reportList.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No orders assigned to this client yet.</p>
      ) : (
        <>
          {groups.map(({ report, orders, commissionPercent }) => (
            <ClientMonthSection
              key={report.id}
              report={report}
              client={client}
              initialOrders={orders}
              initialPercent={commissionPercent}
              statuses={statuses}
              allClients={allClients}
            />
          ))}
          {hasMore && (
            <div className="text-center mt-2">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-4 py-2 text-sm border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? 'Loading…' : `Load more (${reportList.length - groups.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ClientDetailClient`
Expected: PASS — both pagination cases green.

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/[id]/ClientDetailClient.tsx src/app/clients/[id]/__tests__/ClientDetailClient.test.tsx
git commit -m "feat: paginate client detail reports with Load more"
```

---

## Task 5: Detail page server render (wire it together)

**Files:**
- Modify: `src/app/clients/[id]/page.tsx`

- [ ] **Step 1: Rewrite the server component**

Replace the entire contents of `src/app/clients/[id]/page.tsx` with:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClient, getClientReportSummary, getClientReportGroups, getClientsBasic } from '@/actions/clients'
import { getOrderStatuses } from '@/actions/orders'
import { ClientDetailClient } from './ClientDetailClient'

const INITIAL_REPORTS = 2

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [client, reportList, statuses, allClients] = await Promise.all([
    getClient(id),
    getClientReportSummary(id),
    getOrderStatuses(),
    getClientsBasic(),
  ])

  if (!client) notFound()

  const totalCommission = reportList.reduce((sum, r) => sum + r.commission, 0)
  const totalReturn = reportList.reduce((sum, r) => sum + r.return, 0)

  const initialGroups = await getClientReportGroups(
    id,
    reportList.slice(0, INITIAL_REPORTS).map((r) => r.report_id)
  )

  return (
    <div>
      <Link href="/clients" className="text-gray-500 hover:text-gray-300 text-sm mb-6 inline-block">← Clients</Link>
      <ClientDetailClient
        client={client}
        clientId={id}
        reportList={reportList}
        initialGroups={initialGroups}
        statuses={statuses}
        allClients={allClients}
        totalCommission={totalCommission}
        totalReturn={totalReturn}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green (commission, ClientCard, ClientDetailClient, and all pre-existing tests).

- [ ] **Step 3: Verify the production build compiles**

Run: `npm run build`
Expected: build completes with no type errors. (If TypeScript flags an unused `getOrdersByClient`/`getReport`/`getReportClient` import anywhere, remove the now-unused import lines — but do NOT delete those exported actions; other code may use them.)

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[id]/page.tsx
git commit -m "feat: load 2 reports initially on client detail, rest via Load more"
```

---

## Manual verification (after Task 5)

1. `npm run dev`, open `/clients`.
2. Confirm each client card lists up to 3 reports (newest first) with commission & return, plus "+N more reports" when the client has >3 reports, and "No orders yet" for a client with no orders.
3. Click a card → client detail shows the top totals (matching the sum of all reports), the newest 2 report sections, and a "Load more" button.
4. Click "Load more" → the next 2 sections append; button disappears once all reports are shown. Editing commission %, orders, and Export still work in each section.

---

## Self-Review

**Spec coverage:**
- Shared `buildClientReportBreakdown` + `ReportBreakdown` type → Task 1.
- `getClients` reshape (per-report breakdown, report names in select, type replaced) → Task 2.
- Detail-page lightweight summary + paginated groups + lightweight client list actions → Task 2 (`getClientReportSummary`, `getClientReportGroups`, `getClientsBasic`).
- Card: per-report rows only, max 3, "+N more", "No orders yet", whole card → detail → Task 3.
- Detail "Load more" (2/page, append, hide when exhausted), totals kept correct → Tasks 4 & 5.
- Testing: helper unit tests (Task 1), ClientCard render test (Task 3), ClientDetailClient load-more test (Task 4) → covered.

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact commands.

**Type consistency:** `ReportBreakdown` (Task 1) and `ReportGroup` (Task 2) are used consistently in actions (Task 2), `ClientDetailClient` props (Task 4), and `page.tsx` (Task 5). `ClientWithReports` replaces `ClientWithTotals` and is used in `getClients` (Task 2) and `ClientCard` (Task 3). `getClientReportGroups(clientId, reportIds)` signature matches between the action (Task 2), the component call (Task 4), and the server render (Task 5). `getClientReportSummary` returns `ReportBreakdown[]`, summed for totals in Task 5 and used as `reportList` in Task 4.

**Note on the detail-page action test:** `getClientReportGroups` / `getClientReportSummary` are thin Supabase queries; their grouping/percent logic reuses the unit-tested `buildClientReportBreakdown` (summary) or is verified via the `ClientDetailClient` mock test + manual verification (groups). No direct Supabase integration test is included, consistent with the repo's existing approach (no tests mock the Supabase client).
