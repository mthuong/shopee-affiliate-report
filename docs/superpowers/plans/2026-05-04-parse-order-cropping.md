# Parse-order cropping & parser hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-confirmed crop step before each Shopee screenshot is sent to Gemini, and harden the parser to drop partial orders silently. Both behaviors gated by an env-var feature flag for instant revert.

**Architecture:** New `ImageCropper` modal + `cropFileToBase64` helper run client-side. `UploadQueue` adds a `'needs-crop'` status before `'queued'`; the worker only picks `'queued'`. `parseImage` server action is unchanged. Prompt + filter in `parse-images.ts` are tightened to reject orders without readable Shopee IDs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Jest + jsdom + @testing-library/react, `react-image-crop` (new dep), Gemini API.

**Spec:** `docs/superpowers/specs/2026-05-04-parse-order-cropping-design.md`

**Test command:** Project has no `test` script. Run Jest directly:
```
npx jest <path-or-pattern>
```

---

## File map

**New files:**
- `src/lib/utils/feature-flags.ts` — exports `CROP_CONFIRM_ENABLED` boolean.
- `src/lib/utils/__tests__/feature-flags.test.ts` — defaults + override.
- `src/lib/utils/crop-image.ts` — `clampCrop` (pure) + `cropFileToBase64` (canvas IO).
- `src/lib/utils/__tests__/crop-image.test.ts` — `clampCrop` unit tests.
- `src/components/reports/ImageCropper.tsx` — modal with `react-image-crop`.
- `src/components/reports/__tests__/ImageCropper.test.tsx` — confirm/use-full/close/remove handlers.

**Modified files:**
- `src/lib/gemini/parse-images.ts` — prompt rewrite + regex filter.
- `src/lib/gemini/__tests__/parse-images.test.ts` — new regex-filter cases.
- `src/components/reports/UploadQueue.tsx` — new status, cropper integration, per-row Crop button.
- `src/app/reports/[id]/ReportDetailClient.tsx` — flag-gated initial status, URL revoke for cropped previews.

---

## Task 1: Install `react-image-crop` and add feature flag

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/lib/utils/feature-flags.ts`
- Test: `src/lib/utils/__tests__/feature-flags.test.ts`

- [ ] **Step 1: Install the dependency**

Run: `npm i react-image-crop`

Expected: `package.json` and `package-lock.json` updated; no peer-dep warnings (peer is React, already present).

- [ ] **Step 2: Write the failing test**

Create `src/lib/utils/__tests__/feature-flags.test.ts`:

```ts
describe('CROP_CONFIRM_ENABLED', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM
    else process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM = ORIGINAL
    jest.resetModules()
  })

  it('defaults to true when env var is unset', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM
    jest.resetModules()
    const { CROP_CONFIRM_ENABLED } = require('../feature-flags')
    expect(CROP_CONFIRM_ENABLED).toBe(true)
  })

  it('is true when env var is "true"', () => {
    process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM = 'true'
    jest.resetModules()
    const { CROP_CONFIRM_ENABLED } = require('../feature-flags')
    expect(CROP_CONFIRM_ENABLED).toBe(true)
  })

  it('is false when env var is exactly "false"', () => {
    process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM = 'false'
    jest.resetModules()
    const { CROP_CONFIRM_ENABLED } = require('../feature-flags')
    expect(CROP_CONFIRM_ENABLED).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/lib/utils/__tests__/feature-flags.test.ts`

Expected: FAIL — `Cannot find module '../feature-flags'`.

- [ ] **Step 4: Implement the flag module**

Create `src/lib/utils/feature-flags.ts`:

```ts
export const CROP_CONFIRM_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM !== 'false'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/lib/utils/__tests__/feature-flags.test.ts`

Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/utils/feature-flags.ts src/lib/utils/__tests__/feature-flags.test.ts
git commit -m "feat: add react-image-crop dep and CROP_CONFIRM_ENABLED flag"
```

---

## Task 2: Harden Gemini prompt + add Shopee ID regex filter

**Files:**
- Modify: `src/lib/gemini/parse-images.ts`
- Modify: `src/lib/gemini/__tests__/parse-images.test.ts`

- [ ] **Step 1: Add failing tests for the regex filter**

Append to `src/lib/gemini/__tests__/parse-images.test.ts` (inside the `describe('parseGeminiResponse', ...)` block):

```ts
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
```

Also add a test asserting the prompt warns against partial orders. Append to the `describe('buildGeminiPrompt', ...)` block:

```ts
  it('warns the model to skip orders with unreadable IDs', () => {
    const prompt = buildGeminiPrompt()
    expect(prompt).toMatch(/skip/i)
    expect(prompt).toMatch(/ID đơn đặt hàng/)
    expect(prompt).toMatch(/never guess|never invent|do not invent/i)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/gemini/__tests__/parse-images.test.ts`

Expected: FAIL — the existing prompt doesn't contain "skip"/"never invent"; the regex tests fail because the current filter only checks `typeof o.order_id === 'string'`, so the lowercase/short/space cases all pass through and yield 1 entry instead of 0.

- [ ] **Step 3: Update the prompt and filter**

Replace the body of `buildGeminiPrompt` and `parseGeminiResponse` in `src/lib/gemini/parse-images.ts`. The full updated file (lines 1–40 only — the rest of the file is unchanged):

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedOrder } from '@/lib/supabase/types'
import type { ModelName } from './model-cascade'

const CHUNK_SIZE = 10

// Shopee order codes seen in the wild are 14 uppercase-alphanumeric chars
// (e.g. 260426S774FDFG, 2604282M8582FA). The 12–16 range is a deliberate
// buffer in case Shopee tweaks the format slightly. Tight enough to reject
// hallucinated junk, loose enough not to drop real orders.
const SHOPEE_ORDER_ID_RE = /^[0-9A-Z]{12,16}$/

export function buildGeminiPrompt(): string {
  return `You are an OCR assistant. Extract Shopee affiliate orders from the provided screenshots.

CRITICAL: Only return an order if you can clearly read its "ID đơn đặt hàng:" line. The Shopee order code is alphanumeric, ~14 characters (example: 260426S774FDFG). If the ID is cut off, blurry, partially obscured, or not visible at all, SKIP that order entirely. Never guess, infer, or invent an order ID. Returning fewer accurate orders is better than inventing IDs.

For each order with a readable ID, return a JSON array entry:
{
  "order_id": "the Shopee order code exactly as shown",
  "product_name": "the product name, or null if not visible",
  "status_name": "the order status text exactly as shown (e.g. Đã hoàn thành, Đã hủy)",
  "commission_vnd": <integer commission amount in VND, no currency symbol>,
  "ordered_at": "ISO 8601 datetime string (e.g. 2026-04-24T15:47:00)"
}

Return ONLY the JSON array. No explanation, no markdown outside the array.
If no orders have readable IDs, return [].`
}

export function parseGeminiResponse(raw: string): ParsedOrder[] {
  if (!raw?.trim()) return []
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (o) =>
          typeof o.order_id === 'string'
          && SHOPEE_ORDER_ID_RE.test(o.order_id.trim())
          && typeof o.commission_vnd === 'number'
      )
      .map((o) => ({
        ...o,
        order_id: o.order_id.trim(),
        status_name: typeof o.status_name === 'string' ? o.status_name : '',
      }))
  } catch {
    return []
  }
}
```

(The rest of the file — `ChunkFailure`, `parseImagesWithGemini` — is untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/gemini/__tests__/parse-images.test.ts`

Expected: PASS — all old tests + the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gemini/parse-images.ts src/lib/gemini/__tests__/parse-images.test.ts
git commit -m "feat: skip orders without readable Shopee IDs (prompt + regex)"
```

---

## Task 3: Add `clampCrop` pure helper

**Files:**
- Create: `src/lib/utils/crop-image.ts`
- Test: `src/lib/utils/__tests__/crop-image.test.ts`

This task adds only the pure rectangle-clamping logic. The canvas IO part is added in Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/__tests__/crop-image.test.ts`:

```ts
import { clampCrop } from '../crop-image'

describe('clampCrop', () => {
  it('returns the rect unchanged when fully inside bounds', () => {
    const result = clampCrop({ x: 10, y: 20, width: 100, height: 200 }, 500, 500)
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 200 })
  })

  it('clamps a negative origin to 0 and reduces size accordingly', () => {
    const result = clampCrop({ x: -10, y: -5, width: 100, height: 100 }, 500, 500)
    expect(result).toEqual({ x: 0, y: 0, width: 90, height: 95 })
  })

  it('clamps width and height that overflow the natural bounds', () => {
    const result = clampCrop({ x: 400, y: 400, width: 200, height: 200 }, 500, 500)
    expect(result).toEqual({ x: 400, y: 400, width: 100, height: 100 })
  })

  it('rounds fractional values to integers', () => {
    const result = clampCrop({ x: 10.7, y: 20.3, width: 100.6, height: 200.2 }, 500, 500)
    expect(result).toEqual({ x: 11, y: 20, width: 101, height: 200 })
  })

  it('returns zero-size rect when input is entirely outside bounds', () => {
    const result = clampCrop({ x: 600, y: 600, width: 100, height: 100 }, 500, 500)
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/utils/__tests__/crop-image.test.ts`

Expected: FAIL — `Cannot find module '../crop-image'`.

- [ ] **Step 3: Implement `clampCrop`**

Create `src/lib/utils/crop-image.ts`:

```ts
export type PixelCrop = { x: number; y: number; width: number; height: number }

export function clampCrop(
  crop: PixelCrop,
  naturalWidth: number,
  naturalHeight: number,
): PixelCrop {
  const x = Math.max(0, Math.round(crop.x))
  const y = Math.max(0, Math.round(crop.y))
  const right = Math.min(naturalWidth, Math.round(crop.x + crop.width))
  const bottom = Math.min(naturalHeight, Math.round(crop.y + crop.height))
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/utils/__tests__/crop-image.test.ts`

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/crop-image.ts src/lib/utils/__tests__/crop-image.test.ts
git commit -m "feat: add clampCrop helper for rect clamping"
```

---

## Task 4: Add `cropFileToBase64` canvas helper

**Files:**
- Modify: `src/lib/utils/crop-image.ts`

`OffscreenCanvas` and `canvas.toBlob` are not reliably available in jsdom, so this function is verified by the manual smoke test in Task 8 rather than a unit test. The pure logic was already covered in Task 3.

- [ ] **Step 1: Append `cropFileToBase64` to `src/lib/utils/crop-image.ts`**

Add below the existing `clampCrop` export:

```ts
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function pickOutputMime(sourceMime: string): string {
  return ALLOWED_MIME_TYPES.has(sourceMime) ? sourceMime : 'image/jpeg'
}

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, sx, sy, sw, sh) => {
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
      },
      close: () => bitmap.close(),
    }
  }
  // Fallback: HTMLImageElement via object URL
  const url = URL.createObjectURL(file)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image for cropping'))
    img.src = url
  })
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, sx, sy, sw, sh) => {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    },
    close: () => URL.revokeObjectURL(url),
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: mime, quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      mime,
      quality,
    )
  })
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function cropFileToBase64(
  file: File,
  rawCrop: PixelCrop,
): Promise<{ base64: string; mimeType: string; blob: Blob }> {
  const bitmap = await loadBitmap(file)
  try {
    const crop = clampCrop(rawCrop, bitmap.width, bitmap.height)
    if (crop.width === 0 || crop.height === 0) {
      throw new Error('Crop area is empty after clamping')
    }
    const useOffscreen = typeof OffscreenCanvas !== 'undefined'
    const canvas: HTMLCanvasElement | OffscreenCanvas = useOffscreen
      ? new OffscreenCanvas(crop.width, crop.height)
      : Object.assign(document.createElement('canvas'), {
          width: crop.width,
          height: crop.height,
        })
    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) throw new Error('Failed to acquire 2D canvas context')
    bitmap.draw(ctx, crop.x, crop.y, crop.width, crop.height)
    const mimeType = pickOutputMime(file.type)
    const blob = await canvasToBlob(canvas, mimeType, 0.92)
    const base64 = await blobToBase64(blob)
    return { base64, mimeType, blob }
  } finally {
    bitmap.close()
  }
}

export async function readFileAsCropped(file: File): Promise<{ base64: string; mimeType: string }> {
  // "Use full image" path: read original bytes without canvas re-encoding.
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return { base64: btoa(binary), mimeType: file.type || 'image/jpeg' }
}
```

- [ ] **Step 2: Re-run the existing tests to confirm `clampCrop` still passes**

Run: `npx jest src/lib/utils/__tests__/crop-image.test.ts`

Expected: PASS — same 5 tests as Task 3.

- [ ] **Step 3: Verify the file type-checks**

Run: `npx tsc --noEmit`

Expected: PASS — no TypeScript errors. (If a `tsc` run is too slow, run `npx tsc --noEmit -p tsconfig.json` and inspect output for errors in `crop-image.ts` only.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/crop-image.ts
git commit -m "feat: add cropFileToBase64 and readFileAsCropped helpers"
```

---

## Task 5: Build `ImageCropper` modal component

**Files:**
- Create: `src/components/reports/ImageCropper.tsx`
- Test: `src/components/reports/__tests__/ImageCropper.test.tsx`

The component-level test mocks `react-image-crop` so it doesn't try to render images in jsdom. The test's job is to verify that our buttons fire the right callbacks; the cropping math is covered separately.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/__tests__/ImageCropper.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageCropper } from '../ImageCropper'

// Mock react-image-crop so it doesn't try to lay out an image in jsdom.
// We render a placeholder in place of the real cropper UI.
jest.mock('react-image-crop', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="rxc-mock">{children}</div>
  ),
  centerCrop: (c: unknown) => c,
  makeAspectCrop: (c: unknown) => c,
}))

// Mock the canvas helper so confirm doesn't depend on canvas APIs.
jest.mock('@/lib/utils/crop-image', () => ({
  __esModule: true,
  cropFileToBase64: jest.fn(async () => ({
    base64: 'CROPPED_BASE64',
    mimeType: 'image/jpeg',
    blob: new Blob(['x'], { type: 'image/jpeg' }),
  })),
  readFileAsCropped: jest.fn(async () => ({
    base64: 'FULL_BASE64',
    mimeType: 'image/jpeg',
  })),
}))

function makeFile(): File {
  return new File(['fake'], 'shot.png', { type: 'image/png' })
}

describe('ImageCropper', () => {
  it('renders header with current/total count', () => {
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={3}
        totalCount={7}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    expect(screen.getByText(/Crop image 3 of 7/i)).toBeInTheDocument()
  })

  it('calls onConfirm with cropped bytes and blob when "Confirm crop" is clicked', async () => {
    const onConfirm = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={onConfirm}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm crop/i }))
    // Wait a microtask for the async helper to resolve.
    await Promise.resolve()
    await Promise.resolve()
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ base64: 'CROPPED_BASE64', mimeType: 'image/jpeg' })
    )
  })

  it('calls onUseFullImage with original bytes when "Use full image" is clicked', async () => {
    const onUseFullImage = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={onUseFullImage}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /use full image/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(onUseFullImage).toHaveBeenCalledWith(
      expect.objectContaining({ base64: 'FULL_BASE64', mimeType: 'image/jpeg' })
    )
  })

  it('calls onRemove when "Remove" is clicked', () => {
    const onRemove = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when "×" close button is clicked', () => {
    const onClose = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={onClose}
        onRemove={jest.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /close cropper/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={onClose}
        onRemove={jest.fn()}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/reports/__tests__/ImageCropper.test.tsx`

Expected: FAIL — `Cannot find module '../ImageCropper'`.

- [ ] **Step 3: Implement the component**

Create `src/components/reports/ImageCropper.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { cropFileToBase64, readFileAsCropped } from '@/lib/utils/crop-image'

const MIN_CROP_SIDE = 32

type Props = {
  file: File
  currentIndex: number
  totalCount: number
  onConfirm: (cropped: { base64: string; mimeType: string; blob: Blob }) => void
  onUseFullImage: (full: { base64: string; mimeType: string }) => void
  onClose: () => void
  onRemove: () => void
}

export function ImageCropper({
  file,
  currentIndex,
  totalCount,
  onConfirm,
  onUseFullImage,
  onClose,
  onRemove,
}: Props) {
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    imgRef.current = e.currentTarget
    const { naturalWidth, naturalHeight } = e.currentTarget
    setCompletedCrop({
      unit: 'px',
      x: 0,
      y: 0,
      width: naturalWidth,
      height: naturalHeight,
    })
  }

  async function handleConfirm() {
    if (busy) return
    const img = imgRef.current
    if (!img) return
    const px: PixelCrop = completedCrop ?? {
      unit: 'px',
      x: 0,
      y: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    if (px.width < MIN_CROP_SIDE || px.height < MIN_CROP_SIDE) return
    setBusy(true)
    try {
      const result = await cropFileToBase64(file, px)
      onConfirm(result)
    } catch (err) {
      console.error('[ImageCropper] crop failed', err)
      setBusy(false)
    }
  }

  async function handleUseFullImage() {
    if (busy) return
    setBusy(true)
    try {
      const result = await readFileAsCropped(file)
      onUseFullImage(result)
    } catch (err) {
      console.error('[ImageCropper] read full image failed', err)
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-gray-950 border border-gray-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">
            Crop image {currentIndex} of {totalCount} — drag to select the order area
          </h3>
          <button
            type="button"
            aria-label="Close cropper"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-200 disabled:opacity-40 px-2"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-auto bg-black/60 flex items-center justify-center p-4">
          <ReactCrop
            crop={crop}
            onChange={(_px, percent) => setCrop(percent)}
            onComplete={(px) => setCompletedCrop(px)}
            keepSelection
            minWidth={MIN_CROP_SIDE}
            minHeight={MIN_CROP_SIDE}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt="Image being cropped"
              onLoad={onImageLoad}
              style={{ maxHeight: '70vh', display: 'block' }}
            />
          </ReactCrop>
        </div>
        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-3 py-1.5 rounded"
          >
            Remove
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUseFullImage}
              disabled={busy}
              className="text-xs text-gray-300 hover:text-gray-100 border border-gray-700 px-3 py-1.5 rounded disabled:opacity-40"
            >
              Use full image
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="text-xs text-white bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Confirm crop'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/reports/__tests__/ImageCropper.test.tsx`

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ImageCropper.tsx src/components/reports/__tests__/ImageCropper.test.tsx
git commit -m "feat: add ImageCropper modal component"
```

---

## Task 6: Wire `ImageCropper` into `UploadQueue`

**Files:**
- Modify: `src/components/reports/UploadQueue.tsx`

This task adds the `'needs-crop'` status, the per-row Crop button, and the auto-opening cropper modal. The worker continues to pick only `'queued'` items but now reads `item.cropped` instead of re-reading the original file.

- [ ] **Step 1: Replace `src/components/reports/UploadQueue.tsx`**

Use Edit/Write to replace the file with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
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
import { ImageCropper } from './ImageCropper'

export type QueueStatus =
  | 'needs-crop'
  | 'queued'
  | 'throttled'
  | 'parsing'
  | 'done'
  | 'failed'

export type QueueItem = {
  id: string
  file: File
  previewUrl: string
  status: QueueStatus
  cropped?: { base64: string; mimeType: string }
  croppedPreviewUrl?: string
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
  const [cooledTick, setCooledTick] = useState(0)

  // ID of the item currently shown in the cropper, or null if no modal is open.
  const [cropTargetId, setCropTargetId] = useState<string | null>(null)
  // True while we're auto-opening the next needs-crop item; user-initiated
  // close suppresses auto-open until they add more files or click Crop.
  const [autoOpenSuppressed, setAutoOpenSuppressed] = useState(false)

  // Auto-open the first needs-crop item when none is currently being cropped.
  useEffect(() => {
    if (cropTargetId !== null) return
    if (autoOpenSuppressed) return
    const next = items.find((i) => i.status === 'needs-crop')
    if (next) setCropTargetId(next.id)
  }, [items, cropTargetId, autoOpenSuppressed])

  // Reset suppression once every needs-crop item has been resolved.
  useEffect(() => {
    if (!autoOpenSuppressed) return
    const anyNeedsCrop = items.some((i) => i.status === 'needs-crop')
    if (!anyNeedsCrop) setAutoOpenSuppressed(false)
  }, [items, autoOpenSuppressed])

  useEffect(() => {
    if (inFlight.current) return
    const next = items.find((i) => i.status === 'queued')
    if (!next) return

    inFlight.current = true
    const id = next.id
    ;(async () => {
      try {
        // Cropped bytes are populated by the ImageCropper. When the cropping
        // flow is disabled (flag off), the item lands in 'queued' without
        // cropped bytes — fall back to reading the original file directly.
        const cropped: { base64: string; mimeType: string } =
          next.cropped ?? (await readFileAsBase64(next.file))
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

          const { orders, error, rateLimited } = await parseImage(cropped, choice.model)

          if (rateLimited) {
            console.warn('[UploadQueue]', choice.model, 'rate-limited; cascading')
            markCooled(cascadeRef.current, choice.model)
            setCooledTick((n) => n + 1)
            continue
          }

          if (error) {
            console.error('[UploadQueue] parse failed for', next.file.name, '—', error)
            onUpdate(id, { status: 'failed', error })
            return
          }

          onUpdate(id, { status: 'done', orders, error: null, model: choice.model })
          onParsed?.(orders)
          return
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('[UploadQueue] threw for', next.file.name, '—', message, e)
        onUpdate(id, { status: 'failed', error: message })
      } finally {
        inFlight.current = false
      }
    })()
  }, [items, onUpdate, onParsed])

  if (items.length === 0) return null

  const failedCount = items.filter((i) => i.status === 'failed').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const activeCount = items.filter(
    (i) => i.status === 'parsing' || i.status === 'throttled' || i.status === 'queued' || i.status === 'needs-crop'
  ).length
  const allDone = activeCount === 0

  void cooledTick
  // eslint-disable-next-line react-hooks/refs
  const availableCount = MODEL_PREFERENCE.length - cascadeRef.current.cooled.size
  const allExhausted = availableCount === 0

  const cropTarget = cropTargetId ? items.find((i) => i.id === cropTargetId) : null
  const totalCropping = items.filter(
    (i) => i.status === 'needs-crop' || (i.id === cropTargetId)
  ).length
  const cropIndex = (() => {
    if (!cropTarget) return 0
    const order = items
      .filter((i) => i.status === 'needs-crop' || i.id === cropTargetId)
      .map((i) => i.id)
    return Math.max(1, order.indexOf(cropTarget.id) + 1)
  })()

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
          <QueueRow
            key={item.id}
            item={item}
            onRetry={() => onUpdate(item.id, { status: 'queued', error: null })}
            onRemove={() => onRemove(item.id)}
            onCrop={() => setCropTargetId(item.id)}
          />
        ))}
      </div>
      {cropTarget && (
        <ImageCropper
          file={cropTarget.file}
          currentIndex={cropIndex}
          totalCount={Math.max(totalCropping, 1)}
          onConfirm={(result) => {
            const objectUrl = URL.createObjectURL(result.blob)
            onUpdate(cropTarget.id, {
              status: 'queued',
              cropped: { base64: result.base64, mimeType: result.mimeType },
              croppedPreviewUrl: objectUrl,
            })
            setCropTargetId(null)
          }}
          onUseFullImage={(full) => {
            onUpdate(cropTarget.id, {
              status: 'queued',
              cropped: full,
            })
            setCropTargetId(null)
          }}
          onClose={() => {
            setCropTargetId(null)
            setAutoOpenSuppressed(true)
          }}
          onRemove={() => {
            setCropTargetId(null)
            onRemove(cropTarget.id)
          }}
        />
      )}
    </div>
  )
}

function QueueRow({
  item,
  onRetry,
  onRemove,
  onCrop,
}: {
  item: QueueItem
  onRetry: () => void
  onRemove: () => void
  onCrop: () => void
}) {
  const thumb = item.croppedPreviewUrl ?? item.previewUrl
  return (
    <div className="flex items-center gap-3 bg-gray-900/40 rounded-lg p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" className="w-12 h-12 object-cover rounded border border-gray-800 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{item.file.name}</p>
        <p className="text-[11px] text-gray-500">{(item.file.size / 1024).toFixed(0)} KB</p>
        {item.status === 'failed' && item.error && (
          <p className="text-[11px] text-red-400 mt-0.5 break-words" title={item.error}>{item.error}</p>
        )}
      </div>
      <StatusBadge item={item} />
      <div className="flex items-center gap-1">
        {item.status === 'needs-crop' && (
          <button onClick={onCrop} className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded">Crop</button>
        )}
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
    case 'needs-crop':
      return <span className="text-xs text-orange-300">✂ Needs crop</span>
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS — no errors. (Watch for `react-image-crop` types — they ship with the package.)

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: PASS, or only pre-existing warnings unrelated to this change.

- [ ] **Step 4: Re-run all unit tests**

Run: `npx jest`

Expected: PASS — full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/UploadQueue.tsx
git commit -m "feat: integrate ImageCropper into UploadQueue with needs-crop state"
```

---

## Task 7: Flag-gated initial status in `ReportDetailClient`

**Files:**
- Modify: `src/app/reports/[id]/ReportDetailClient.tsx`

- [ ] **Step 1: Edit `addFiles` and `removeItem`/`clearQueue` to handle the flag and `croppedPreviewUrl`**

Replace lines 37–66 of `src/app/reports/[id]/ReportDetailClient.tsx` with:

```tsx
  function addFiles(files: File[]) {
    const items: QueueItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      // Flag on: pause for cropper. Flag off: go straight to queued — the
      // worker reads the original file as a fallback when cropped is missing.
      status: CROP_CONFIRM_ENABLED ? 'needs-crop' : 'queued',
      orders: [],
      error: null,
    }))
    setQueue((prev) => [...prev, ...items])
  }

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => {
      const target = prev.find((i) => i.id === id)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
        if (target.croppedPreviewUrl) URL.revokeObjectURL(target.croppedPreviewUrl)
      }
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const clearQueue = useCallback(() => {
    setQueue((prev) => {
      for (const i of prev) {
        URL.revokeObjectURL(i.previewUrl)
        if (i.croppedPreviewUrl) URL.revokeObjectURL(i.croppedPreviewUrl)
      }
      return []
    })
  }, [])
```

Also update the imports at the top of the file. Replace the existing import block (lines 1–15) with:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImageUploader } from '@/components/reports/ImageUploader'
import { PendingOrdersReview, type EditableOrder } from '@/components/reports/PendingOrdersReview'
import { UploadQueue, type QueueItem } from '@/components/reports/UploadQueue'
import { OrdersTable } from '@/components/orders/OrdersTable'
import { OrderModal } from '@/components/orders/OrderModal'
import { AssignClientButton } from '@/components/orders/AssignClientButton'
import { AssignClientPopup } from '@/components/orders/AssignClientPopup'
import { SelectActionBar } from '@/components/orders/SelectActionBar'
import { assignOrdersToClient } from '@/actions/orders'
import { useToast } from '@/components/ui/Toast'
import { CROP_CONFIRM_ENABLED } from '@/lib/utils/feature-flags'
import type { OrderWithStatus, OrderStatus, Client, ParsedOrder } from '@/lib/supabase/types'
```

Also update the unmount cleanup `useEffect` to revoke `croppedPreviewUrl` too. Replace the existing block (around lines 151–158) with:

```tsx
  useEffect(() => {
    return () => {
      setQueue((prev) => {
        for (const i of prev) {
          URL.revokeObjectURL(i.previewUrl)
          if (i.croppedPreviewUrl) URL.revokeObjectURL(i.croppedPreviewUrl)
        }
        return prev
      })
    }
  }, [])
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: PASS.

- [ ] **Step 3: Re-run unit tests**

Run: `npx jest`

Expected: PASS — full suite green.

- [ ] **Step 4: Commit**

```bash
git add src/app/reports/[id]/ReportDetailClient.tsx
git commit -m "feat: gate cropper flow behind CROP_CONFIRM_ENABLED in ReportDetailClient"
```

---

## Task 8: Manual smoke test in the dev server

**Files:** none — verification only.

Type checking and unit tests verify code correctness, not feature correctness. This task validates the end-to-end flow in a browser, which is required by the project's CLAUDE.md guidance.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 2: With flag default (enabled), upload the valid sample**

In a browser, log in, open a report, and upload `docs/tasks/valid/Screenshot 2026-05-04 at 11.05.28 PM.png`.

Expected:
- Queue row shows `✂ Needs crop`.
- Cropper modal auto-opens with header `Crop image 1 of 1 — drag to select the order area`.
- Clicking **Confirm crop** without dragging exports the full image; queue advances to `⚡ Parsing…` then `✓ 1 order`.
- The parsed `order_id` is `260426S774FDFG`.

- [ ] **Step 3: Upload all three invalid samples**

Upload all three files from `docs/tasks/invalid/` at once.

Expected:
- Modal cycles through them: `1 of 3`, `2 of 3`, `3 of 3`.
- Cropping each to exclude the partial top order, then **Confirm crop**, parses fewer than 3 orders total — and importantly, **no invented IDs** appear (any returned `order_id` is one that was clearly readable in the cropped image).

- [ ] **Step 4: Test the close-and-resume flow**

Add 3 files, then click the modal's `×` button after cropping the first.

Expected:
- Modal closes.
- Remaining 2 rows stay at `✂ Needs crop` with a **Crop** button visible.
- Clicking **Crop** on row 2 re-opens the modal for that row only.
- Adding more files later auto-opens the modal again for the new arrivals.

- [ ] **Step 5: Test the revert path**

Stop the dev server. In `.env.local`, add `NEXT_PUBLIC_ENABLE_CROP_CONFIRM=false`. Restart `npm run dev`.

Upload the valid sample again.

Expected:
- No cropper modal opens.
- Queue row goes straight to `⏳ Queued` → `⚡ Parsing…` → `✓ 1 order`.
- Behavior matches pre-feature flow.

- [ ] **Step 6: Restore flag and final commit (if any leftover uncommitted state)**

Run: `git status`

Expected: clean working tree. If any incidental changes (e.g., `.env.local`), revert them — do not commit `.env.local`.

---

## Self-review checklist (run before declaring done)

- [ ] All Jest tests pass: `npx jest`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] Lint passes: `npm run lint`
- [ ] Manual smoke test (Task 8) was actually executed in a browser, not skipped.
- [ ] `git log --oneline` shows one commit per task (8 commits: dep+flag, prompt+regex, clampCrop, cropFileToBase64, ImageCropper, UploadQueue, ReportDetailClient — Task 8 has no commit).
- [ ] `.env.local` is not tracked (verify with `git status`).
