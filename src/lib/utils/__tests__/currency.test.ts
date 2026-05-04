import { formatVND, parseVND } from '../currency'

describe('formatVND', () => {
  it('formats zero', () => {
    expect(formatVND(0)).toBe('₫0')
  })

  it('formats thousands with comma separator', () => {
    expect(formatVND(6630)).toBe('₫6,630')
  })

  it('formats large values', () => {
    expect(formatVND(1234567)).toBe('₫1,234,567')
  })
})

describe('parseVND', () => {
  it('parses plain number string', () => {
    expect(parseVND('6630')).toBe(6630)
  })

  it('parses comma-formatted string', () => {
    expect(parseVND('6,630')).toBe(6630)
  })

  it('returns 0 for empty string', () => {
    expect(parseVND('')).toBe(0)
  })

  it('returns 0 for invalid input', () => {
    expect(parseVND('abc')).toBe(0)
  })
})
