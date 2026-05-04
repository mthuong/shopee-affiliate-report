import { buildGeminiPrompt, parseGeminiResponse } from '../parse-images'

describe('buildGeminiPrompt', () => {
  it('contains key extraction fields', () => {
    const prompt = buildGeminiPrompt()
    expect(prompt).toContain('order_id')
    expect(prompt).toContain('commission_vnd')
    expect(prompt).toContain('JSON')
  })
})

describe('parseGeminiResponse', () => {
  it('parses a valid JSON array response', () => {
    const raw = JSON.stringify([{
      order_id: '2604282M8582FA',
      product_name: 'Test Product',
      status_name: 'Đã hoàn thành',
      commission_vnd: 6630,
      ordered_at: '2026-04-24T15:47:00',
    }])
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].order_id).toBe('2604282M8582FA')
    expect(result[0].commission_vnd).toBe(6630)
  })

  it('parses response wrapped in markdown code block', () => {
    const raw = '```json\n[{"order_id":"X","product_name":null,"status_name":"Đã hủy","commission_vnd":0,"ordered_at":"2026-04-01T10:00:00"}]\n```'
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].order_id).toBe('X')
  })

  it('returns empty array on invalid JSON', () => {
    expect(parseGeminiResponse('not json')).toEqual([])
  })

  it('returns empty array on empty string', () => {
    expect(parseGeminiResponse('')).toEqual([])
  })

  it('coerces null status_name to empty string', () => {
    const raw = JSON.stringify([{
      order_id: 'X',
      product_name: 'P',
      status_name: null,
      commission_vnd: 100,
      ordered_at: '2026-04-01T10:00:00',
    }])
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status_name).toBe('')
  })

  it('coerces missing status_name to empty string', () => {
    const raw = JSON.stringify([{
      order_id: 'X',
      product_name: 'P',
      commission_vnd: 100,
      ordered_at: '2026-04-01T10:00:00',
    }])
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status_name).toBe('')
  })
})
