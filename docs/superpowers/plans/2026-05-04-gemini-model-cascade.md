# Gemini Model Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-model upload-queue throttle with a quality-prioritised cascade across all four free-tier image-capable Gemini models, lifting steady-state throughput from 5 RPM / 20 RPD to ~35 RPM / 560 RPD.

**Architecture:** Pure cascade logic in a new `model-cascade.ts` module (testable without mocks). Server actions become "dumb" — `parseImage(image, modelName)` accepts the model explicitly and returns a `rateLimited: boolean` flag. `UploadQueue` owns the cascade state in a `useRef`, walks `MODEL_PREFERENCE` in order, marks rate-limited models `cooled` for the session, and shows per-row model badges plus a live "N of 4 models available" header indicator.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Jest (jsdom default + per-file `node` env for server-action imports), Tailwind, `@google/generative-ai` SDK.

**Spec:** `docs/superpowers/specs/2026-05-04-gemini-model-cascade-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/gemini/model-cascade.ts` | Pure logic: model list, state shape, `pickNextModel`, `markCalled`, `markCooled`, `isRateLimitError` |
| Create | `src/lib/gemini/__tests__/model-cascade.test.ts` | Unit tests for the cascade module (no mocks needed) |
| Modify | `src/lib/gemini/parse-images.ts` | `parseImagesWithGemini(images, modelName)` — `modelName` becomes a required parameter |
| Modify | `src/actions/parse.ts` | `parseImage(image, modelName)` and `parseImages(images, modelName)` — both forward model name; `parseImage` return shape gains `rateLimited: boolean` |
| Modify | `src/components/reports/UploadQueue.tsx` | Replace global throttle with cascade state ref + worker loop; `QueueItem.model?` field; status badge shows model abbreviation; header shows "N of 4 models available" or all-exhausted banner |

No file is split or renamed. The new module is the only added unit; everything else is in-place modification.

---

## Task 1: Create `model-cascade.ts` pure module with unit tests

**Files:**
- Create: `src/lib/gemini/model-cascade.ts`
- Create: `src/lib/gemini/__tests__/model-cascade.test.ts`

This task is fully TDD-able because the module has no I/O, no React, no SDK imports.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/gemini/__tests__/model-cascade.test.ts`:

```ts
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
    markCalled(state, 'gemini-3-flash', 1000)                // ready at 14000 (interval 13s)
    markCalled(state, 'gemini-3.1-flash-lite-preview', 1000) // ready at 6000  (interval 5s)
    expect(pickNextModel(state, 2000)).toEqual({ model: 'gemini-3.1-flash-lite-preview', waitMs: 4000 })
  })

  it('respects per-model minIntervalMs differences (picks ready non-preferred over not-ready preferred)', () => {
    const state = createCascadeState()
    markCalled(state, 'gemini-2.5-flash', 0)
    markCalled(state, 'gemini-2.5-flash-lite', 0)
    markCalled(state, 'gemini-3-flash', 0)
    markCalled(state, 'gemini-3.1-flash-lite-preview', 0)
    // At now=8000: 2.5-flash (13s) NOT ready; 2.5-flash-lite (7s) IS ready → wins (first ready in preference order)
    expect(pickNextModel(state, 8000)).toEqual({ model: 'gemini-2.5-flash-lite', waitMs: 0 })
  })

  it('cascades past a cooled model that would otherwise be earliest-ready', () => {
    const state = createCascadeState()
    markCalled(state, 'gemini-2.5-flash', 1000)
    markCalled(state, 'gemini-2.5-flash-lite', 1000)
    markCalled(state, 'gemini-3-flash', 1000)
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
    expect(modelShortName('gemini-3-flash')).toBe('3')
    expect(modelShortName('gemini-3.1-flash-lite-preview')).toBe('3.1-lite')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/gemini/__tests__/model-cascade.test.ts`

Expected: ALL fail with module-not-found error (`Cannot find module '../model-cascade'`).

- [ ] **Step 3: Implement the module**

Create `src/lib/gemini/model-cascade.ts`:

```ts
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
    const last = state.lastCallAt.get(m.name) ?? 0
    if (now >= last + m.minIntervalMs) {
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/gemini/__tests__/model-cascade.test.ts`

Expected: All tests pass (count: 6 in `pickNextModel` + 6 in `isRateLimitError` + 2 in `markCalled/markCooled` + 1 in `modelShortName` = 15).

- [ ] **Step 5: Run full suite + type check**

```bash
npx jest
npx tsc --noEmit
```

Expected: 35 (existing) + 15 (new) = 50 tests pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gemini/model-cascade.ts src/lib/gemini/__tests__/model-cascade.test.ts
git commit -m "feat: add model-cascade module with rate-limit detection"
```

---

## Task 2: Update server actions to accept `modelName`

**Files:**
- Modify: `src/lib/gemini/parse-images.ts`
- Modify: `src/actions/parse.ts`

This task changes call signatures only. Existing tests cover the pure helpers (`buildGeminiPrompt`, `parseGeminiResponse`); the SDK-touching functions are not unit-tested in this repo (no mocking infrastructure), so verification is type-check + lint + the action test suite.

- [ ] **Step 1: Update `parseImagesWithGemini`**

Open `src/lib/gemini/parse-images.ts`. At the top, add the import:

```ts
import type { ModelName } from './model-cascade'
```

Replace the function signature and the model line. Find this section:

```ts
export async function parseImagesWithGemini(
  imageFiles: { base64: string; mimeType: string }[]
): Promise<{ orders: ParsedOrder[]; failures: ChunkFailure[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
```

Replace with:

```ts
export async function parseImagesWithGemini(
  imageFiles: { base64: string; mimeType: string }[],
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; failures: ChunkFailure[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })
```

No other changes in this file.

- [ ] **Step 2: Update `parseImage` and `parseImages` actions**

Open `src/actions/parse.ts`. Update the imports — find:

```ts
import { parseImagesWithGemini } from '@/lib/gemini/parse-images'
```

Replace with:

```ts
import { parseImagesWithGemini } from '@/lib/gemini/parse-images'
import { isRateLimitError, type ModelName } from '@/lib/gemini/model-cascade'
```

Then replace the entire `parseImages` and `parseImage` function bodies. Find:

```ts
export async function parseImages(
  images: ImageInput[]
): Promise<{ orders: ParsedOrder[]; failedChunkCount: number }> {
  const { orders, failures } = await parseImagesWithGemini(images)
  return { orders, failedChunkCount: failures.length }
}

export async function parseImage(
  image: ImageInput
): Promise<{ orders: ParsedOrder[]; error: string | null }> {
  try {
    const { orders, failures } = await parseImagesWithGemini([image])
    if (failures.length > 0) {
      const message = failures[0].message
      console.error('[parseImage] failed:', message)
      return { orders: [], error: message }
    }
    return { orders, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('[parseImage] threw:', message, e)
    return { orders: [], error: message }
  }
}
```

Replace with:

```ts
export async function parseImages(
  images: ImageInput[],
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; failedChunkCount: number }> {
  const { orders, failures } = await parseImagesWithGemini(images, modelName)
  return { orders, failedChunkCount: failures.length }
}

export async function parseImage(
  image: ImageInput,
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; error: string | null; rateLimited: boolean }> {
  try {
    const { orders, failures } = await parseImagesWithGemini([image], modelName)
    if (failures.length > 0) {
      const message = failures[0].message
      const rateLimited = isRateLimitError(message)
      console.error('[parseImage]', modelName, 'failed:', message)
      return { orders: [], error: message, rateLimited }
    }
    return { orders, error: null, rateLimited: false }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    const rateLimited = isRateLimitError(e)
    console.error('[parseImage]', modelName, 'threw:', message, e)
    return { orders: [], error: message, rateLimited }
  }
}
```

- [ ] **Step 3: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/lib/gemini/parse-images.ts src/actions/parse.ts
```

Expected: both clean. (Type errors would arise if `UploadQueue.tsx` still calls `parseImage(image)` without a model name — that's fixed in Task 3.) Tasks 2 and 3 must therefore be reviewed/committed sequentially without time gap; if you ran tsc before Task 3, you'd see a single error in `UploadQueue.tsx`.

To temporarily satisfy tsc between commits, run only file-scoped checks:

```bash
npx tsc --noEmit -p . --listFiles 2>&1 | grep -E "(error|UploadQueue)" | head
```

Or just defer the full repo tsc to after Task 3.

- [ ] **Step 4: Run unit tests**

Run: `npx jest`

Expected: 50 tests pass (existing + Task 1's). Note: the existing `orders.test.ts` and parse-related tests don't call `parseImage` or `parseImages` directly, so signature changes don't break them.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gemini/parse-images.ts src/actions/parse.ts
git commit -m "feat: server actions accept modelName and return rateLimited flag"
```

Note: the repo will compile-fail at this point because `UploadQueue.tsx` still calls `parseImage(image)` without `modelName`. Task 3 fixes this immediately. Do not run `npx tsc --noEmit` on the whole project until Task 3 is done — it will fail.

---

## Task 3: Wire `UploadQueue` to the cascade

**Files:**
- Modify: `src/components/reports/UploadQueue.tsx`

This is a whole-file replacement. The new file replaces the global `RATE_LIMIT_INTERVAL_MS` + `lastCallAtRef` with a `cascadeStateRef`, restructures the worker effect to loop through the cascade on rate-limit, threads the chosen model into `QueueItem.model`, and updates the badge + header to display the new state.

- [ ] **Step 1: Replace the file contents**

Open `src/components/reports/UploadQueue.tsx`. Replace the entire file with:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { parseImage } from '@/actions/parse'
import {
  createCascadeState,
  markCalled,
  markCooled,
  modelShortName,
  pickNextModel,
  MODEL_PREFERENCE,
  type CascadeState,
  type ModelName,
} from '@/lib/gemini/model-cascade'
import type { ParsedOrder } from '@/lib/supabase/types'

export type QueueStatus = 'queued' | 'throttled' | 'parsing' | 'done' | 'failed'

export type QueueItem = {
  id: string
  file: File
  previewUrl: string
  status: QueueStatus
  orders: ParsedOrder[]
  error: string | null
  model?: ModelName
}

type Props = {
  items: QueueItem[]
  onUpdate: (id: string, patch: Partial<QueueItem>) => void
  onRemove: (id: string) => void
  onClearAll: () => void
  onParsed?: (orders: ParsedOrder[]) => void
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({ base64: result.split(',')[1], mimeType: file.type })
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function UploadQueue({ items, onUpdate, onRemove, onClearAll, onParsed }: Props) {
  const inFlight = useRef(false)
  const cascadeRef = useRef<CascadeState>(createCascadeState())

  useEffect(() => {
    if (inFlight.current) return
    const next = items.find((i) => i.status === 'queued')
    if (!next) return

    inFlight.current = true
    const id = next.id
    const file = next.file
    ;(async () => {
      try {
        // Pre-load the image bytes once; reused across cascade attempts.
        const image = await readFileAsBase64(file)

        while (true) {
          const choice = pickNextModel(cascadeRef.current)
          if (!choice) {
            onUpdate(id, { status: 'failed', error: 'All Gemini models exhausted today — try again after midnight UTC' })
            return
          }

          if (choice.waitMs > 0) {
            onUpdate(id, { status: 'throttled' })
            await new Promise((r) => setTimeout(r, choice.waitMs))
          }

          onUpdate(id, { status: 'parsing' })
          markCalled(cascadeRef.current, choice.model)

          const { orders, error, rateLimited } = await parseImage(image, choice.model)

          if (rateLimited) {
            console.warn('[UploadQueue]', choice.model, 'rate-limited; cascading')
            markCooled(cascadeRef.current, choice.model)
            // No-op patch forces parent setQueue → re-render, so the header's
            // `availableCount` (derived from cascadeRef.current.cooled.size) updates live.
            onUpdate(id, {})
            continue
          }

          if (error) {
            console.error('[UploadQueue] parse failed for', file.name, '—', error)
            onUpdate(id, { status: 'failed', error })
            return
          }

          onUpdate(id, { status: 'done', orders, error: null, model: choice.model })
          onParsed?.(orders)
          return
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('[UploadQueue] threw for', file.name, '—', message, e)
        onUpdate(id, { status: 'failed', error: message })
      } finally {
        inFlight.current = false
      }
    })()
  }, [items, onUpdate, onParsed])

  if (items.length === 0) return null

  const failedCount = items.filter((i) => i.status === 'failed').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const activeCount = items.filter((i) => i.status === 'parsing' || i.status === 'throttled' || i.status === 'queued').length
  const allDone = activeCount === 0

  const cooledCount = cascadeRef.current.cooled.size
  const availableCount = MODEL_PREFERENCE.length - cooledCount
  const allExhausted = availableCount === 0

  return (
    <div className="mt-4 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-200 text-sm">
          Upload queue — {doneCount} parsed{failedCount > 0 ? `, ${failedCount} failed` : ''}{!allDone ? `, ${activeCount} pending` : ''}
        </h3>
        <button onClick={onClearAll} className="text-xs text-gray-500 hover:text-gray-300">Clear all</button>
      </div>
      {allExhausted ? (
        <p className="text-[11px] text-red-400 mb-3">⚠ All Gemini models exhausted today — try again after midnight UTC</p>
      ) : (
        <p className="text-[11px] text-gray-500 mb-3">
          {availableCount} of {MODEL_PREFERENCE.length} models available
        </p>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <QueueRow key={item.id} item={item} onRetry={() => onUpdate(item.id, { status: 'queued', error: null })} onRemove={() => onRemove(item.id)} />
        ))}
      </div>
    </div>
  )
}

function QueueRow({ item, onRetry, onRemove }: { item: QueueItem; onRetry: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-gray-900/40 rounded-lg p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.previewUrl} alt="" className="w-12 h-12 object-cover rounded border border-gray-800 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{item.file.name}</p>
        <p className="text-[11px] text-gray-500">{(item.file.size / 1024).toFixed(0)} KB</p>
        {item.status === 'failed' && item.error && (
          <p className="text-[11px] text-red-400 mt-0.5 break-words" title={item.error}>{item.error}</p>
        )}
      </div>
      <StatusBadge item={item} />
      <div className="flex items-center gap-1">
        {item.status === 'failed' && (
          <button onClick={onRetry} className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded">Retry</button>
        )}
        {item.status !== 'parsing' && item.status !== 'throttled' && (
          <button onClick={onRemove} className="text-xs text-gray-500 hover:text-red-400 px-2 py-1" title="Remove">✕</button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ item }: { item: QueueItem }) {
  switch (item.status) {
    case 'queued':
      return <span className="text-xs text-gray-500">⏳ Queued</span>
    case 'throttled':
      return <span className="text-xs text-gray-400 animate-pulse" title="Waiting for rate limit">⏱ Waiting…</span>
    case 'parsing':
      return <span className="text-xs text-orange-400 animate-pulse">⚡ Parsing…</span>
    case 'done': {
      const suffix = item.model ? ` · ${modelShortName(item.model)}` : ''
      const title = item.model ? `Parsed by ${item.model}` : undefined
      return (
        <span className="text-xs text-green-400" title={title}>
          ✓ {item.orders.length} order{item.orders.length === 1 ? '' : 's'}{suffix}
        </span>
      )
    }
    case 'failed':
      return <span className="text-xs text-red-400" title={item.error ?? ''}>✗ Failed</span>
  }
}
```

**What changed (summary for review):**

1. New imports from `@/lib/gemini/model-cascade`.
2. `QueueStatus` unchanged. `QueueItem` gains optional `model?: ModelName`.
3. `UploadQueue` replaces `lastCallAtRef` with `cascadeRef` (`useRef<CascadeState>`). On `markCooled`, a no-op `onUpdate(id, {})` patch forces the parent `setQueue` → re-render, so the "N of 4" header counter (derived from `cascadeRef.current.cooled.size`) updates live.
4. Worker `useEffect` now `while(true)` loops: `pickNextModel` → throttle wait → call → on `rateLimited`, mark cooled and continue; on `error`, fail row; on success, mark done with `model`.
5. Image bytes are read once at the top of the loop and reused across cascade attempts (avoids re-reading the same file 4 times if all preferred models are cooled).
6. Header subtitle is now dynamic: live `availableCount` or all-exhausted warning.
7. Status badge for `done` shows `✓ N orders · 2.5-lite` style suffix with full model name in `title=`.

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/reports/UploadQueue.tsx
```

Expected: both clean. After this task, the project compiles end-to-end again (Task 2 left it temporarily uncompilable on its own).

- [ ] **Step 3: Run full test suite**

Run: `npx jest`

Expected: 50/50 pass.

- [ ] **Step 4: Smoke check via dev server**

Start (or confirm) the dev server is on :3000, then:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/reports/df3f3d66-40d1-4b5d-81ed-e4148f87f2ed
```

Expected: 200. (No browser interaction yet — just confirming the page compiles.)

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/UploadQueue.tsx
git commit -m "feat: cascade across all four free-tier Gemini models"
```

---

## Task 4: Manual smoke test + final review

This task is human-driven. The implementer's job is to launch the verification, summarise findings, and dispatch the final code review.

- [ ] **Step 1: Run all CI checks**

```bash
npx tsc --noEmit
npx eslint .
npx jest
```

Expected: tsc clean, jest 50/50, eslint warnings/errors limited to pre-existing items in `src/components/orders/OrderModal.tsx` and `src/components/ui/Toast.tsx`.

- [ ] **Step 2: Cold-start cascade smoke test**

In the browser at `http://localhost:3000/reports/df3f3d66-40d1-4b5d-81ed-e4148f87f2ed`:

1. Open DevTools console.
2. Drop a single image into the uploader.
3. Expected sequence:
   - Queue row appears with `⏳ Queued`.
   - If `gemini-2.5-flash` is exhausted today (likely, since it was at 22/20): row goes `⚡ Parsing…` → console logs `[UploadQueue] gemini-2.5-flash rate-limited; cascading` → header ticks `4 of 4 → 3 of 4 models available` → row re-enters `⚡ Parsing…` on `gemini-2.5-flash-lite` → `✓ N orders · 2.5-lite`.
   - If 2.5-flash quota has reset: row goes straight to `✓ N orders · 2.5`.
4. Verify the badge tooltip shows the full model name on hover.

- [ ] **Step 3: Burst smoke test**

1. Drop 6 images simultaneously.
2. Expected sequence:
   - First 4 images fire near-concurrently, one per model in preference order. Each gets `⚡ Parsing…` then `✓ N orders · <model>`.
   - 5th image: `⏱ Waiting…` for ~5s (3.1-flash-lite ready first), then `⚡ Parsing…` → done.
   - 6th image: `⏱ Waiting…` for ~7s (2.5-flash-lite ready next), then done.
3. Verify the header always reads `N of 4 models available` reflecting which models are cooled.

- [ ] **Step 4: Dispatch the final code reviewer**

Use the superpowers code-reviewer subagent. Scope:

- Base: `210840a` (the spec-clarifications commit before any implementation)
- Head: current HEAD
- Files: `src/lib/gemini/model-cascade.ts`, `src/lib/gemini/__tests__/model-cascade.test.ts`, `src/lib/gemini/parse-images.ts`, `src/actions/parse.ts`, `src/components/reports/UploadQueue.tsx`

Ask the reviewer to verify:
- Cascade algorithm is correct under all branches (fresh state, all cooled, mixed cooling, stale `lastCallAt`).
- 429 detection uses both `rateLimited: true` from the action AND wouldn't accidentally classify a non-rate-limit error as one.
- `cooledTickRef` is the right way to force the "N of 4" header re-render, vs alternatives (a `useState` for cooled set, etc.).
- File responsibilities are clean: `model-cascade.ts` is pure, `parse.ts` is the I/O layer, `UploadQueue.tsx` orchestrates.
- No regressions in the existing edit/delete/manual-add/parse-review flows of `ReportDetailClient`.

- [ ] **Step 5: Commit any review-driven adjustments**

If the reviewer flags critical or important issues, fix them and commit. If only minor, document them and move on.

```bash
git add <changed files>
git commit -m "fix: <issue>"
```

---

## Done

When all tasks are complete, the upload queue:

- Cycles through all four free-tier Gemini models in quality-priority order
- Detects 429s server-side via `isRateLimitError`, propagates `rateLimited: true` to the client, marks the model `cooled` for the session
- Throttles per-model based on each model's RPM cap (~13s for 5-RPM, ~5s for 15-RPM)
- Shows users which model parsed each row and how many models remain available
- Surfaces an explicit warning when all four are exhausted

Steady-state ceiling: ~35 RPM peak / 560 RPD (vs. previous 5 RPM / 20 RPD).
