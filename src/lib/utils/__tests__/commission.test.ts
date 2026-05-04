import { calcReturn, calcTotalReturn, calcSubtotal } from '../commission'

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
