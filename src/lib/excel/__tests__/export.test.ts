import { buildExcelRows } from '../export'

describe('buildExcelRows', () => {
  const orders = [
    { order_id: '2604282M8582FA', product_name: 'Test Product', ordered_at: '2026-04-24T15:47:00', status_name: 'Đã hoàn thành', commission: 6630, commission_return: 3315 },
    { order_id: '2604291X1234AB', product_name: null, ordered_at: '2026-04-29T09:12:00', status_name: 'Đã hoàn thành', commission: 14200, commission_return: 7100 },
  ]

  it('returns header row + data rows', () => {
    expect(buildExcelRows(orders)).toHaveLength(3)
  })

  it('header contains expected column names', () => {
    const [header] = buildExcelRows(orders)
    expect(header).toContain('Order ID')
    expect(header).toContain('Commission (₫)')
    expect(header).toContain('Commission Return (₫)')
  })

  it('data rows contain correct values', () => {
    const [, row1] = buildExcelRows(orders)
    expect(row1[0]).toBe('2604282M8582FA')
    expect(row1[4]).toBe(6630)
    expect(row1[5]).toBe(3315)
  })

  it('uses empty string for null product_name', () => {
    const [, , row2] = buildExcelRows(orders)
    expect(row2[1]).toBe('')
  })
})
