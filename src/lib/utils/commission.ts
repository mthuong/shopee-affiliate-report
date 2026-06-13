import type { ReportBreakdown } from '@/lib/supabase/types'

export const COMPLETED_STATUS_ID = 1
export const DEFAULT_COMMISSION_PERCENT = 50

export function calcReturn(commission: number, percent: number): number {
  return Math.floor((commission * percent) / 100)
}

export function calcSubtotal(orders: { commission: number }[]): number {
  return orders.reduce((sum, o) => sum + o.commission, 0)
}

export function calcTotalReturn(
  orders: { commission: number }[],
  percent: number
): number {
  return orders.reduce((sum, o) => sum + calcReturn(o.commission, percent), 0)
}

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
