export type ModelName =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-3-flash'
  | 'gemini-3.1-flash-lite-preview'

export type ModelInfo = {
  name: ModelName
  // 60000 / RPM, with ~1s safety buffer to avoid edge-case 429s
  minIntervalMs: number
  // Short label for UI badges
  shortName: string
}

// Order = preference. Earlier = tried first.
// Quality-first ordering: GA models before preview, full-size before lite.
export const MODEL_PREFERENCE: ModelInfo[] = [
  { name: 'gemini-2.5-flash',                minIntervalMs: 13000, shortName: '2.5' },
  { name: 'gemini-2.5-flash-lite',           minIntervalMs:  7000, shortName: '2.5-lite' },
  { name: 'gemini-3-flash',                  minIntervalMs: 13000, shortName: '3' },
  { name: 'gemini-3.1-flash-lite-preview',   minIntervalMs:  5000, shortName: '3.1-lite' },
]

export function modelShortName(name: ModelName): string {
  return MODEL_PREFERENCE.find((m) => m.name === name)?.shortName ?? name
}

export type CascadeState = {
  lastCallAt: Map<ModelName, number>
  cooled: Set<ModelName>
}

export function createCascadeState(): CascadeState {
  return { lastCallAt: new Map(), cooled: new Set() }
}

export function markCalled(state: CascadeState, model: ModelName, at: number = Date.now()): void {
  state.lastCallAt.set(model, at)
}

export function markCooled(state: CascadeState, model: ModelName): void {
  state.cooled.add(model)
}

export function pickNextModel(
  state: CascadeState,
  now: number = Date.now()
): { model: ModelName; waitMs: number } | null {
  const available = MODEL_PREFERENCE.filter((m) => !state.cooled.has(m.name))
  if (available.length === 0) return null

  // First pass: pick the highest-preference model that is ready right now.
  for (const m of available) {
    const last = state.lastCallAt.get(m.name)
    if (last === undefined || now >= last + m.minIntervalMs) {
      return { model: m.name, waitMs: 0 }
    }
  }

  // Second pass: all available models are within their cooldown window.
  // Pick whichever is ready soonest.
  let best = available[0]
  let bestReadyAt = (state.lastCallAt.get(best.name) ?? 0) + best.minIntervalMs
  for (let i = 1; i < available.length; i++) {
    const m = available[i]
    const readyAt = (state.lastCallAt.get(m.name) ?? 0) + m.minIntervalMs
    if (readyAt < bestReadyAt) {
      best = m
      bestReadyAt = readyAt
    }
  }
  return { model: best.name, waitMs: Math.max(0, bestReadyAt - now) }
}

const RATE_LIMIT_PATTERN = /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i

export function isRateLimitError(error: unknown): boolean {
  if (error == null) return false
  let message: string
  if (error instanceof Error) message = error.message
  else if (typeof error === 'string') message = error
  else return false
  return RATE_LIMIT_PATTERN.test(message)
}
