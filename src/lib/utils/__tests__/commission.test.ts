import { calcReturn, calcTotalReturn, calcSubtotal, buildClientReportBreakdown } from '../commission'

describe('calcReturn', () => {
  it('calculates 50% of commission', () => {
    expect(calcReturn(6630, 50)).toBe(3315)
  })

  it('floors fractional results', () => {
    expect(calcReturn(6631, 50)).toBe(3315)
  })

  it('returns 0 for 0 percent', () => {
    expect(calcReturn(6630, 0)).toBe(0)
  })

  it('returns full amount for 100 percent', () => {
    expect(calcReturn(6630, 100)).toBe(6630)
  })
})

describe('calcSubtotal', () => {
  it('sums commissions', () => {
    const orders = [{ commission: 6630 }, { commission: 14200 }]
    expect(calcSubtotal(orders)).toBe(20830)
  })
})

describe('calcTotalReturn', () => {
  it('sums floor(commission * percent / 100) for each order', () => {
    const orders = [{ commission: 6630 }, { commission: 14200 }]
    expect(calcTotalReturn(orders, 50)).toBe(10415)
  })
})

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
