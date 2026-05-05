import {
  createCascadeState,
  pickNextModel,
  markCalled,
  markCooled,
  isRateLimitError,
  modelShortName,
  MODEL_PREFERENCE,
} from '../model-cascade'

describe('pickNextModel', () => {
  it('returns the first preferred model when state is fresh', () => {
    const state = createCascadeState()
    expect(pickNextModel(state, 1000)).toEqual({ model: 'gemini-2.5-flash', waitMs: 0 })
  })

  it('skips a cooled model and picks the next preferred', () => {
    const state = createCascadeState()
    markCooled(state, 'gemini-2.5-flash')
    expect(pickNextModel(state, 1000)).toEqual({ model: 'gemini-2.5-flash-lite', waitMs: 0 })
  })

  it('returns null when every model is cooled', () => {
    const state = createCascadeState()
    for (const m of MODEL_PREFERENCE) markCooled(state, m.name)
    expect(pickNextModel(state, 1000)).toBeNull()
  })

  it('returns earliest-ready model with positive waitMs when all are cooling', () => {
    const state = createCascadeState()
    markCalled(state, 'gemini-2.5-flash', 1000)              // ready at 14000 (interval 13s)
    markCalled(state, 'gemini-2.5-flash-lite', 1000)         // ready at 8000  (interval 7s)
    markCalled(state, 'gemini-3-flash-preview', 1000)                // ready at 14000 (interval 13s)
    markCalled(state, 'gemini-3.1-flash-lite-preview', 1000) // ready at 6000  (interval 5s)
    expect(pickNextModel(state, 2000)).toEqual({ model: 'gemini-3.1-flash-lite-preview', waitMs: 4000 })
  })

  it('respects per-model minIntervalMs differences (picks ready non-preferred over not-ready preferred)', () => {
    const state = createCascadeState()
    markCalled(state, 'gemini-2.5-flash', 0)
    markCalled(state, 'gemini-2.5-flash-lite', 0)
    markCalled(state, 'gemini-3-flash-preview', 0)
    markCalled(state, 'gemini-3.1-flash-lite-preview', 0)
    // At now=8000: 2.5-flash (13s) NOT ready; 2.5-flash-lite (7s) IS ready → wins (first ready in preference order)
    expect(pickNextModel(state, 8000)).toEqual({ model: 'gemini-2.5-flash-lite', waitMs: 0 })
  })

  it('cascades past a cooled model that would otherwise be earliest-ready', () => {
    const state = createCascadeState()
    markCalled(state, 'gemini-2.5-flash', 1000)
    markCalled(state, 'gemini-2.5-flash-lite', 1000)
    markCalled(state, 'gemini-3-flash-preview', 1000)
    markCalled(state, 'gemini-3.1-flash-lite-preview', 1000)
    markCooled(state, 'gemini-3.1-flash-lite-preview')
    // 3.1-lite cooled; among remaining, 2.5-flash-lite ready earliest at 8000
    expect(pickNextModel(state, 2000)).toEqual({ model: 'gemini-2.5-flash-lite', waitMs: 6000 })
  })
})

describe('isRateLimitError', () => {
  const REAL_GEMINI_429 =
    '[GoogleGenerativeAI Error]: Error fetching from ' +
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: ' +
    '[429 Too Many Requests] You exceeded your current quota, please check your plan and ' +
    'billing details. * Quota exceeded for metric: ' +
    'generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, ' +
    'model: gemini-2.5-flash Please retry in 31.073790986s.'

  it('matches the verbatim Gemini SDK 429 message', () => {
    expect(isRateLimitError(new Error(REAL_GEMINI_429))).toBe(true)
  })

  it('matches RESOURCE_EXHAUSTED', () => {
    expect(isRateLimitError(new Error('Status: RESOURCE_EXHAUSTED'))).toBe(true)
  })

  it('matches "quota" case-insensitively', () => {
    expect(isRateLimitError(new Error('your QUOTA was exceeded'))).toBe(true)
  })

  it('matches "rate limit"', () => {
    expect(isRateLimitError(new Error('rate limit hit'))).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isRateLimitError(new Error('Network timeout'))).toBe(false)
    expect(isRateLimitError(new Error('Invalid input'))).toBe(false)
  })

  it('tolerates null, undefined, and string throwables', () => {
    expect(isRateLimitError(null)).toBe(false)
    expect(isRateLimitError(undefined)).toBe(false)
    expect(isRateLimitError('quota exceeded')).toBe(true)
    expect(isRateLimitError(42)).toBe(false)
  })
})

describe('markCalled / markCooled', () => {
  it('markCalled sets lastCallAt for the model', () => {
    const state = createCascadeState()
    markCalled(state, 'gemini-2.5-flash', 12345)
    expect(state.lastCallAt.get('gemini-2.5-flash')).toBe(12345)
  })

  it('markCooled adds the model to cooled set', () => {
    const state = createCascadeState()
    markCooled(state, 'gemini-2.5-flash')
    expect(state.cooled.has('gemini-2.5-flash')).toBe(true)
  })
})

describe('modelShortName', () => {
  it('returns short names for known models', () => {
    expect(modelShortName('gemini-2.5-flash')).toBe('2.5')
    expect(modelShortName('gemini-2.5-flash-lite')).toBe('2.5-lite')
    expect(modelShortName('gemini-3-flash-preview')).toBe('3')
    expect(modelShortName('gemini-3.1-flash-lite-preview')).toBe('3.1-lite')
  })
})
