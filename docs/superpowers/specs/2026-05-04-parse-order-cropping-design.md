# Parse-order improvements: user-confirmed crop + parser hardening

## Background

Users upload mobile screenshots of Shopee's affiliate transaction list. Because the list scrolls vertically and viewports are limited, screenshots typically include **partial orders** at the top or bottom — orders whose `ID đơn đặt hàng:` header is cut off. Reference examples:

- Valid: `docs/tasks/valid/` — full order with readable ID.
- Invalid: `docs/tasks/invalid/` — order body visible but ID line missing or cut off.
- Real-world report screenshots: `tasks/report/` — long lists where the same order can appear partial in one screenshot and complete in another (overlapping screenshots while scrolling).

The current parser (`src/lib/gemini/parse-images.ts`) sends raw images to Gemini with a prompt that does not warn against partial orders, and only filters by `typeof order_id === 'string'`. The model occasionally invents IDs for partial orders, producing junk rows the user must clean up by hand.

## Goals

1. **Drop partial orders silently.** When an order's ID is not readable, no row is produced. Dedup on `(report_id, order_id)` already handles the case where the same order appears complete in another screenshot the user uploaded.
2. **Add a user-confirmed crop step before parsing.** The user trims each image to the area containing complete orders, reducing the chance Gemini sees partial cards in the first place.

## Feature flag

The cropping flow is gated behind a public env var:

```
NEXT_PUBLIC_ENABLE_CROP_CONFIRM=true   # default; new flow active
NEXT_PUBLIC_ENABLE_CROP_CONFIRM=false  # disabled; pre-feature behavior
```

Read once at module scope:

```ts
// src/lib/utils/feature-flags.ts
export const CROP_CONFIRM_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CROP_CONFIRM !== 'false'
```

`ReportDetailClient` is the only consumer:

- **`true`** (default): newly added files start as `needs-crop`; the cropper auto-opens; worker only proceeds after the user confirms.
- **`false`**: newly added files start as `queued` with `cropped` populated directly from the original file's bytes (the existing pre-feature behavior). The cropper modal is never rendered. The `needs-crop` status, the `Crop` button, and the `<ImageCropper>` import all become dead code under this flag — kept in the bundle but never reached.

The parser hardening (prompt rewrite + regex filter) is **not** behind the flag — it's a pure improvement that benefits both code paths and has no UX cost to revert.

To revert the cropping UX: set `NEXT_PUBLIC_ENABLE_CROP_CONFIRM=false` in the deploy environment. No code change or redeploy of source needed.

## Non-goals

- Stitching across screenshots (merging the bottom of image N with the top of image N+1).
- Auto-detection of order boundaries.
- Re-cropping after a successful parse.
- Persisting crop selections across page reloads.
- Server-side cropping.

## Architecture

One new modal component, one new client-side helper, two state additions on `QueueItem`, one prompt rewrite, one filter tightening. No server changes.

```
files added
   │
   ▼
QueueItem(status='needs-crop')   ◄────────────┐
   │                                          │
   ▼                                          │
ImageCropper modal opens (auto for first;     │
re-opened per row via "Crop" button)          │
   │                                          │
   ├─ onConfirm({base64, mime})  ─┐           │
   ├─ onUseFullImage              ├─► QueueItem(status='queued', cropped=…)
   ├─ onClose                     │           │  (worker picks up 'queued')
   └─ onRemove                    │           │
                                  └───────────┘ (stays needs-crop)

QueueItem(status='queued') ──► existing worker ──► parseImage(item.cropped, model)
```

The whole change is local to the upload flow. `parseImage` server action stays identical — it just receives cropped bytes instead of full-image bytes.

## Detailed design

### Queue states & data flow

`QueueItem` adds one status and two optional fields:

```ts
export type QueueStatus =
  | 'needs-crop'
  | 'queued'
  | 'throttled'
  | 'parsing'
  | 'done'
  | 'failed'

export type QueueItem = {
  id: string
  file: File                                       // original, untouched
  previewUrl: string                               // original preview
  status: QueueStatus
  cropped?: { base64: string; mimeType: string }   // populated on confirm
  croppedPreviewUrl?: string                       // queue-row thumbnail after crop
  orders: ParsedOrder[]
  error: string | null
  model?: ModelName
}
```

**Flow when files are added:**

1. Files arrive (in `ReportDetailClient`) → each becomes a `needs-crop` item.
2. Hybrid auto-open: when at least one item is `needs-crop` and no cropper modal is currently open, `UploadQueue` auto-targets the first `needs-crop` item and renders `<ImageCropper>` for it. After confirm or use-full-image, the item flips to `queued` with `cropped` populated; the modal advances to the next `needs-crop` item if any.
3. If the user closes the modal mid-batch, the targeted item stays `needs-crop` and the modal does **not** re-open until the user explicitly clicks the row's **Crop** button or adds more files.
4. Worker `useEffect` (existing) only picks items with `status === 'queued'`. With the flag on, `item.cropped` is populated by the cropper's `onConfirm` / `onUseFullImage`. With the flag off, `item.cropped` is undefined and the worker falls back to reading `item.file` directly via its inline `readFileAsBase64` helper. The chosen bytes are passed to `parseImage`.

**Removal:** `onRemove` works in any pre-`done` state (including `needs-crop`). Both `previewUrl` and `croppedPreviewUrl` (if present) get `URL.revokeObjectURL` on remove/clear.

### `ImageCropper` modal

```ts
type Props = {
  file: File
  remainingCount: number  // for header "Image 3 of 7"
  onConfirm: (cropped: { base64: string; mimeType: string }) => void
  onUseFullImage: () => void
  onClose: () => void
  onRemove: () => void
}
```

**Layout (top → bottom):**

- **Header:** `"Crop image N of M — drag to select the order area"`, with close (×).
- **Body:** the image with `react-image-crop`'s draggable rectangle.
  - Free aspect (no constraint).
  - Initial rectangle: full image (so confirming without dragging effectively means "use full image").
  - Min crop: 32 × 32 px (rejects accidental tiny rectangles in `onConfirm`).
- **Footer:**
  - `Use full image` — secondary action; calls `onUseFullImage`. The caller reads the original `File` as base64 and stores it in `cropped`. No `croppedPreviewUrl` is set; the queue row keeps showing the original `previewUrl`.
  - `Remove` — destructive, left-aligned; calls `onRemove`.
  - `Confirm crop` — primary; calls `onConfirm` with the cropped bytes (canvas re-encoded). The caller also sets `croppedPreviewUrl` from the returned blob so the queue row reflects the crop.

**Keyboard:**

- `Esc` → `onClose`.
- `Enter` → `onConfirm` if rect is valid (≥ min size), else no-op.

**On confirm:**

1. Read the percent/pixel crop from `react-image-crop`.
2. Pass to `cropFileToBase64(file, pixelCrop)` (helper below).
3. Helper draws to an offscreen canvas at the source's natural resolution, exports via `canvas.toBlob(mimeType, 0.92)`, reads blob → data URL → strips the `data:` prefix → returns `{base64, mimeType}`.
4. Output MIME matches source MIME (`image/png` stays PNG, `image/jpeg` stays JPEG; unknown MIMEs fall back to `image/jpeg`).
5. The caller (`UploadQueue`) generates `croppedPreviewUrl = URL.createObjectURL(blob)` so the row thumbnail reflects the crop.

### Crop helper

`src/lib/utils/crop-image.ts`:

```ts
export type PixelCrop = { x: number; y: number; width: number; height: number }

export async function cropFileToBase64(
  file: File,
  crop: PixelCrop,
): Promise<{ base64: string; mimeType: string; blob: Blob }>
```

- Loads the file via `createImageBitmap(file)` (fall back to `<img>` + object URL if unavailable).
- Clamps the crop rect to the image's natural bounds.
- Draws to `OffscreenCanvas` (or `HTMLCanvasElement` fallback) at natural resolution.
- Picks output MIME: source MIME if it's `image/png`, `image/jpeg`, or `image/webp`; else `image/jpeg`.
- Exports via `canvas.convertToBlob({ type: mime, quality: 0.92 })`.
- Returns the blob (for object-URL preview) plus the base64 string (for upload).

### Parser hardening

**Prompt rewrite (`buildGeminiPrompt` in `src/lib/gemini/parse-images.ts`):**

```
You are an OCR assistant. Extract Shopee affiliate orders from the provided
screenshots.

CRITICAL: Only return an order if you can clearly read its "ID đơn đặt hàng:"
line. The Shopee order code is alphanumeric, ~14 characters (example:
260426S774FDFG). If the ID is cut off, blurry, partially obscured, or not
visible at all, SKIP that order entirely. Never guess, infer, or invent an
order ID. Returning fewer accurate orders is better than inventing IDs.

For each order with a readable ID, return a JSON array entry:
{
  "order_id": "the Shopee order code exactly as shown",
  "product_name": "the product name, or null if not visible",
  "status_name": "the order status text exactly as shown (e.g. Đã hoàn thành, Đã hủy)",
  "commission_vnd": <integer commission amount in VND, no currency symbol>,
  "ordered_at": "ISO 8601 datetime string (e.g. 2026-04-24T15:47:00)"
}

Return ONLY the JSON array. No explanation, no markdown outside the array.
If no orders have readable IDs, return [].
```

**Filter tightening (`parseGeminiResponse`):**

Second-line defense against models that ignore the prompt. Add a Shopee ID-shape regex:

```ts
// Shopee order codes seen in the wild: 14 uppercase-alphanumeric chars.
// Examples: 260426S774FDFG, 2604282M8582FA, 260427V9M4HJEU.
// Range 12–16 is a deliberate buffer in case Shopee tweaks the format.
const SHOPEE_ORDER_ID_RE = /^[0-9A-Z]{12,16}$/

// In the .filter():
typeof o.order_id === 'string'
  && SHOPEE_ORDER_ID_RE.test(o.order_id.trim())
  && typeof o.commission_vnd === 'number'
```

### Files to change

**New:**

- `src/components/reports/ImageCropper.tsx`
- `src/lib/utils/crop-image.ts`
- `src/lib/utils/feature-flags.ts`
- `src/components/reports/__tests__/ImageCropper.test.tsx`
- `src/lib/utils/__tests__/crop-image.test.ts`

**Modified:**

- `src/components/reports/UploadQueue.tsx`
  - Add `'needs-crop'` to `QueueStatus`; add `cropped` + `croppedPreviewUrl` to `QueueItem`.
  - Worker `useEffect`: pick only `'queued'`, read `item.cropped`.
  - Internal "current cropping target" state; render `<ImageCropper>` when set.
  - Auto-open the first `needs-crop` item when no modal is open.
  - Per-row **Crop** button while status is `needs-crop`.
  - `StatusBadge`: new branch `needs-crop → "✂ Needs crop"`.
- `src/app/reports/[id]/ReportDetailClient.tsx`
  - Initial status of newly-added files: `'needs-crop'` if `CROP_CONFIRM_ENABLED`, else `'queued'` (no `cropped` field — the worker's fallback reads the original file, matching pre-feature behavior).
  - Revoke `croppedPreviewUrl` alongside `previewUrl` on remove/clear.
- `src/lib/gemini/parse-images.ts`
  - `buildGeminiPrompt` rewrite.
  - `parseGeminiResponse` regex filter.
- `src/lib/gemini/__tests__/parse-images.test.ts`
  - New cases: lowercase ID rejected, too-short ID rejected, ID with spaces rejected, valid 14-char ID kept.

**Dependency:**

- `npm i react-image-crop` (~30 kB, MIT).

**No changes:**

- Server actions (`parseImage`, `parseImagesWithGemini`).
- Model cascade.
- DB schema, supabase types.

## Testing

- **Unit:** `parseGeminiResponse` regex filter; `cropFileToBase64` MIME preservation, rect clamping, base64 round-trip.
- **Component:** `ImageCropper` confirm / use-full-image / close / remove / Esc handlers.
- **Manual smoke:**
  - Upload one of `docs/tasks/valid/Screenshot 2026-05-04 at 11.05.28 PM.png` → cropper opens → confirm full image → one order parsed.
  - Upload all three from `docs/tasks/invalid/` → cropper opens for each → confirming full image yields zero or one orders (depending on whether any ID is readable in the crop), and no invented IDs appear.
  - Upload several real-world `tasks/report/*.jpg` screenshots → crop the order area in each → parsed rows match what's visibly readable in the crops; no invented IDs.

## Open risks

- **Library size:** `react-image-crop` adds ~30 kB to the report-detail bundle. Acceptable given this page is gated behind auth and used by a small audience.
- **Old browsers without `OffscreenCanvas`:** the helper falls back to `HTMLCanvasElement`. No support burden expected for the target audience (modern desktop/mobile browsers).
- **Regex too tight or too loose:** if Shopee changes the ID format outside `[0-9A-Z]{12,16}`, we'll silently drop real orders. The prompt change alone catches most cases; the regex is defense-in-depth, not the primary filter.
