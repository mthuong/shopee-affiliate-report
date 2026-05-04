import { formatOrderDate, formatDateForExcel, defaultReportName } from '../date'

describe('formatOrderDate', () => {
  it('formats ISO string to DD-MM-YYYY HH:mm', () => {
    expect(formatOrderDate('2026-04-24T15:47:00')).toBe('24-04-2026 15:47')
  })

  it('handles UTC timestamptz from Supabase', () => {
    expect(formatOrderDate('2026-04-24T08:47:00.000Z')).toMatch(/24-04-2026/)
  })
})

describe('formatDateForExcel', () => {
  it('returns DD-MM-YYYY HH:mm string', () => {
    expect(formatDateForExcel('2026-04-24T15:47:00')).toBe('24-04-2026 15:47')
  })
})

describe('defaultReportName', () => {
  it('returns "Month YYYY" for a given date', () => {
    const date = new Date(2026, 3, 1) // April 2026
    expect(defaultReportName(date)).toBe('April 2026')
  })
})
