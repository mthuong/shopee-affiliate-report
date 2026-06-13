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

  it('accepts an ArrayBuffer input and round-trips Vietnamese status and commission via codepage:65001', () => {
    const bytes = new TextEncoder().encode(
      csv('ORD7,Completed,2026-05-08 10:00:00,Áo thun,300'),
    )
    const result = parseAffiliateCsv(bytes.buffer)
    expect(result).toHaveLength(1)
    expect(result[0].order_id).toBe('ORD7')
    expect(result[0].status_name).toBe('Đã hoàn thành')
    expect(result[0].commission_vnd).toBe(300)
  })

  it('normalizeDate string fallback: Order Time arriving as a plain string produces correct ordered_at', () => {
    // XLSX's `type:'string'` path already passes through cellDates, but we also
    // exercise the string-input branch of normalizeDate by passing a CSV whose
    // date cell looks like a plain string to the parser.
    const result = parseAffiliateCsv(
      csv('ORD8,Cancelled,2026-12-31 23:59:59,Widget,500'),
    )
    expect(result[0].ordered_at).toBe('2026-12-31T23:59:59')
  })
})
