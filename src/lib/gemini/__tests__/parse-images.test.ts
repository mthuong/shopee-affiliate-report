import { buildGeminiPrompt, parseGeminiResponse } from '../parse-images'

describe('buildGeminiPrompt', () => {
  it('contains key extraction fields', () => {
    const prompt = buildGeminiPrompt()
    expect(prompt).toContain('order_id')
    expect(prompt).toContain('commission_vnd')
    expect(prompt).toContain('JSON')
  })

  it('warns the model to skip orders with unreadable IDs', () => {
    const prompt = buildGeminiPrompt()
    expect(prompt).toMatch(/skip/i)
    expect(prompt).toMatch(/ID đơn đặt hàng/)
    expect(prompt).toMatch(/never guess|never invent|do not invent/i)
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
    const raw = '```json\n[{"order_id":"260427V9M4HJEU","product_name":null,"status_name":"Đã hủy","commission_vnd":0,"ordered_at":"2026-04-01T10:00:00"}]\n```'
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].order_id).toBe('260427V9M4HJEU')
  })

  it('returns empty array on invalid JSON', () => {
    expect(parseGeminiResponse('not json')).toEqual([])
  })

  it('returns empty array on empty string', () => {
    expect(parseGeminiResponse('')).toEqual([])
  })

  it('coerces null status_name to empty string', () => {
    const raw = JSON.stringify([{
      order_id: '260427V9M4HJEU',
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
      order_id: '260427V9M4HJEU',
      product_name: 'P',
      commission_vnd: 100,
      ordered_at: '2026-04-01T10:00:00',
    }])
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status_name).toBe('')
  })

  it('rejects entries with lowercase order_id (regex filter)', () => {
    const raw = JSON.stringify([{
      order_id: '2604282m8582fa',
      product_name: 'P',
      status_name: 'Đã hoàn thành',
      commission_vnd: 100,
      ordered_at: '2026-04-24T15:47:00',
    }])
    expect(parseGeminiResponse(raw)).toEqual([])
  })

  it('rejects entries with too-short order_id', () => {
    const raw = JSON.stringify([{
      order_id: 'ABC123',
      product_name: 'P',
      status_name: 'X',
      commission_vnd: 100,
      ordered_at: '2026-04-24T15:47:00',
    }])
    expect(parseGeminiResponse(raw)).toEqual([])
  })

  it('rejects entries whose order_id contains spaces', () => {
    const raw = JSON.stringify([{
      order_id: '260426 S774FDFG',
      product_name: 'P',
      status_name: 'X',
      commission_vnd: 100,
      ordered_at: '2026-04-24T15:47:00',
    }])
    expect(parseGeminiResponse(raw)).toEqual([])
  })

  it('keeps entries with a valid 14-char Shopee ID', () => {
    const raw = JSON.stringify([{
      order_id: '260426S774FDFG',
      product_name: 'P',
      status_name: 'Đã hoàn thành',
      commission_vnd: 14390,
      ordered_at: '2026-04-26T08:39:00',
    }])
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].order_id).toBe('260426S774FDFG')
  })

  it('trims surrounding whitespace before regex check', () => {
    const raw = JSON.stringify([{
      order_id: '  260426S774FDFG  ',
      product_name: 'P',
      status_name: 'X',
      commission_vnd: 100,
      ordered_at: '2026-04-26T08:39:00',
    }])
    const result = parseGeminiResponse(raw)
    expect(result).toHaveLength(1)
  })
})
