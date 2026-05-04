import { buildExcelRows, sanitizeCell } from '../export'

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

  it('formats date as DD-MM-YYYY HH:mm', () => {
    const [, row1] = buildExcelRows(orders)
    expect(row1[2]).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/)
  })

  it('returns header-only sheet for empty orders', () => {
    const result = buildExcelRows([])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(['Order ID', 'Product Name', 'Date', 'Status', 'Commission (₫)', 'Commission Return (₫)'])
  })
})

describe('sanitizeCell (formula injection guard)', () => {
  it('prefixes leading = with apostrophe', () => {
    expect(sanitizeCell('=cmd|"/c calc"!A1')).toBe("'=cmd|\"/c calc\"!A1")
  })

  it('prefixes leading +, -, @, tab, CR', () => {
    expect(sanitizeCell('+evil')).toBe("'+evil")
    expect(sanitizeCell('-evil')).toBe("'-evil")
    expect(sanitizeCell('@evil')).toBe("'@evil")
    expect(sanitizeCell('\tevil')).toBe("'\tevil")
    expect(sanitizeCell('\revil')).toBe("'\revil")
  })

  it('leaves safe values untouched', () => {
    expect(sanitizeCell('Test Product')).toBe('Test Product')
    expect(sanitizeCell('')).toBe('')
    expect(sanitizeCell('2604282M8582FA')).toBe('2604282M8582FA')
  })

  it('sanitizes product_name in built rows', () => {
    const [, row] = buildExcelRows([
      { order_id: 'A', product_name: '=HYPERLINK("evil")', ordered_at: '2026-04-24T15:47:00', status_name: 'OK', commission: 0, commission_return: 0 },
    ])
    expect(row[1]).toBe('\'=HYPERLINK("evil")')
  })
})
