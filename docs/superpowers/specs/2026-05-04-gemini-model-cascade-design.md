# Gemini Model Cascade — Design Spec

**Date:** 2026-05-04
**Status:** Approved
**Scope:** Image-parsing pipeline (`parseImage` + `UploadQueue`)

---

## Problem

The image upload queue currently uses a single Gemini model (`gemini-2.5-flash`) with a global 13s spacing throttle (5 RPM). Two consequences:

1. **Daily quota ceiling.** `gemini-2.5-flash` free tier is 20 RPD. The user already exhausted it today (dashboard shows 22/20). Additional parses return 429s and the queue surfaces them as failures.
2. **Throughput ceiling.** Even within a day, the single-model cap is 5 RPM and 20 RPD — far below what the free tier offers when summed across all available image-capable models on this API key.

The user wants to "use all the free tier limits" — extracting maximum throughput across all four image-capable text-out models on the same key:

| Model | RPM | RPD |
|---|---|---|
| gemini-2.5-flash | 5 | 20 |
| gemini-2.5-flash-lite | 10 | 20 |
| gemini-3-flash | 5 | 20 |
| gemini-3.1-flash-lite-preview | 15 | **500** |

Sum: 35 RPM peak / 560 RPD — roughly 28× the daily ceiling and 7× the steady-state RPM of the current single-model setup.

## Goal

Parse uploaded screenshots using a quality-prioritised cascade across all four models, falling back automatically when any single model is rate-limited or daily-exhausted, with no persistent state and no user-visible regressions in the steady-state quality path.

## Non-goals

- Persistent quota tracking across sessions (localStorage / DB). Per-session memory only.
- Server-side cascade state (would be flaky on Vercel Fluid Compute and overkill for a single-user app).
- Cross-tab quota coordination.
- Retries beyond cascade fall-through (no exponential backoff on the same model).
- Configurable model set (the four are hardcoded; adding a fifth means a code change).

## Architecture

**Cascade state lives client-side**, in a `useRef` inside `UploadQueue`. The server action becomes "dumb" — it accepts an explicit `modelName` and calls Gemini with that one model. Selection logic, per-model timestamps, and "cooled" set are all client-side.

**New file:** `src/lib/gemini/model-cascade.ts` — pure functions (model list, `pickNextModel`, state helpers, rate-limit detection). Fully unit-testable; no Gemini SDK or React imports.

**Modified files:**
- `src/lib/gemini/parse-images.ts` — `parseImagesWithGemini(imageFiles, modelName)` accepts model name as a required parameter, replacing the hardcoded `'gemini-2.5-flash'`.
- `src/actions/parse.ts` — `parseImage(image, modelName)` and `parseImages(images, modelName)` both forward the parameter; `parseImage`'s return shape gains a `rateLimited: boolean` field.
- `src/components/reports/UploadQueue.tsx` — replaces the global 13s throttle with the cascade. Tracks state via `useRef<CascadeState>`. Each parse loops through the cascade until a model returns a non-rate-limit result.

## Cascade Algorithm

### Model preference list

```ts
const MODEL_PREFERENCE: ModelInfo[] = [
  { name: 'gemini-2.5-flash',                minIntervalMs: 13000 }, //  5 RPM
  { name: 'gemini-2.5-flash-lite',           minIntervalMs:  7000 }, // 10 RPM
  { name: 'gemini-3-flash',                  minIntervalMs: 13000 }, //  5 RPM
  { name: 'gemini-3.1-flash-lite-preview',   minIntervalMs:  5000 }, // 15 RPM
]
```

`minIntervalMs` is `60000 / RPM` rounded up with ~1s safety buffer to avoid edge-case 429s.

### State

```ts
type CascadeState = {
  lastCallAt: Map<ModelName, number>  // ms epoch of last call to each model
  cooled:     Set<ModelName>          // models that returned 429 this session
}
```

Created fresh on `UploadQueue` mount. Reset on page reload.

### `pickNextModel(state, now = Date.now())`

Pure function. Returns `{ model, waitMs } | null`.

1. Filter `MODEL_PREFERENCE` to models not in `state.cooled`. If empty → return `null`.
2. **Ready-now pass:** walk filtered list in preference order. First model where `now >= (state.lastCallAt.get(name) ?? 0) + minIntervalMs` wins → return `{ model, waitMs: 0 }`.
3. **Wait pass:** if no model is ready right now, find the model whose ready-time `(lastCallAt + minIntervalMs)` is earliest. Return it with `waitMs = max(0, readyAt - now)`.

### `isRateLimitError(error: unknown): boolean`

Matches case-insensitive: `\b429\b`, `RESOURCE_EXHAUSTED`, `quota`, `rate limit`. Used both server-side (to set `rateLimited` on the action's return) and as a backup client-side classifier.

**All 429-class errors are treated uniformly** — we don't distinguish per-minute (`GenerateRequestsPerMinute`) from per-day (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) quota violations. Any 429 cools the model for the session. This is correct because our per-model `minIntervalMs` spacing prevents per-minute violations, so any 429 we actually observe is overwhelmingly likely to be the daily quota — and "cool for session" is the right response to that. Per-minute violations slip-through (e.g. from a clock skew or buffer underflow) would unnecessarily mark a model cooled, but the cascade still produces a correct result and the user can recover by reloading the page.

We also deliberately ignore the `retryDelay` field on Google's `RetryInfo` payload. Cascading to the next model is faster than waiting, and the suggested delay is unreliable for daily-quota errors (Google sometimes returns a short delay even when the actual reset is at midnight UTC).

### Real-world 429 error format (test fixture)

The Gemini SDK surfaces a 429 as a single `Error` whose `message` looks like (one line, broken here for readability):

```
[GoogleGenerativeAI Error]: Error fetching from
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent:
[429 Too Many Requests] You exceeded your current quota, please check your plan and
billing details. ... * Quota exceeded for metric:
generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20,
model: gemini-2.5-flash Please retry in 31.073790986s. [{"@type":...,"violations":[{
"quotaMetric":"...","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier",
"quotaDimensions":{"location":"global","model":"gemini-2.5-flash"},"quotaValue":"20"
}]},{"@type":"...RetryInfo","retryDelay":"31s"}]
```

`isRateLimitError` must return `true` for this string. The unit test must include the verbatim message above as a fixture.

### Worker loop in `UploadQueue`

```
for each queued item:
  loop:
    choice = pickNextModel(state)
    if choice is null:
      mark item failed with error "All Gemini models exhausted today"
      break
    if choice.waitMs > 0:
      mark item 'throttled'
      sleep choice.waitMs
    mark item 'parsing'
    state.lastCallAt[choice.model] = Date.now()  // mark BEFORE call (counts toward quota)
    image = await readFileAsBase64(file)
    { orders, error, rateLimited } = await parseImage(image, choice.model)
    if rateLimited:
      state.cooled.add(choice.model)
      continue   // cascade to next model immediately, no delay
    if error:
      mark item failed with error
      break
    mark item 'done' with orders and model
    onParsed?.(orders)
    break
```

`lastCallAt` is set **before** the call because even a 429 response counts against Google's rate-limit window from their side. Marking after-success would let us blast the same model multiple times during a long-running call.

There is no exponential backoff. The cascade *is* the fallback strategy. We never retry the same model after a 429 within the same session.

## Server Action API Changes

### `parseImagesWithGemini`

Was:
```ts
async function parseImagesWithGemini(imageFiles): Promise<{ orders, failures }>
// hardcoded gemini-2.5-flash
```

Becomes:
```ts
async function parseImagesWithGemini(imageFiles, modelName: ModelName): Promise<{ orders, failures }>
```

`modelName` is **required**. The hardcoded model is gone.

### `parseImage`

Was:
```ts
async function parseImage(image): Promise<{ orders: ParsedOrder[]; error: string | null }>
```

Becomes:
```ts
async function parseImage(
  image,
  modelName: ModelName,
): Promise<{ orders: ParsedOrder[]; error: string | null; rateLimited: boolean }>
```

The added `rateLimited` flag is set to `true` when the underlying Gemini call threw an error matching `isRateLimitError`. The client uses it to drive the cascade decision rather than re-running string matching on the error message.

### `parseImages` (legacy bulk)

Updated for signature parity:
```ts
async function parseImages(images, modelName: ModelName): Promise<{ orders, failedChunkCount }>
```

It is currently not called from any UI path (the `UploadQueue` per-image flow replaced it), but the export is preserved for API stability.

## UI Changes

### Status badge

`QueueItem` gains an optional `model?: ModelName` field, set when the worker transitions to `done`. The "done" badge becomes:

```
✓ 5 orders · 2.5-lite
```

Short-name mapping:
- `gemini-2.5-flash` → `2.5`
- `gemini-2.5-flash-lite` → `2.5-lite`
- `gemini-3-flash` → `3`
- `gemini-3.1-flash-lite-preview` → `3.1-lite`

The full model name is set as a `title=` tooltip on the badge for hover-debugging.

### Models-available indicator

Replace the existing "Throttled to 5 requests/min (Gemini free tier)" subtitle with a live count derived from `state.cooled`:

```
4 of 4 models available
```

When `state.cooled.size === MODEL_PREFERENCE.length`, swap to a warning:

```
⚠ All Gemini models exhausted today — try again after midnight UTC
```

### Failure-mode UX

When `pickNextModel` returns `null` for a row, the row is marked `failed` with `error: "All Gemini models exhausted today"`. Subsequent queued rows produce the same outcome until the user reloads the page (typically the next day). No infinite spinner, no silent stalls.

## Edge Cases

| Case | Behaviour |
|---|---|
| Multiple browser tabs | Each has its own cascade state. They may collectively exceed quota; both see 429 and cascade. Acceptable — single-user app, rare to have multiple tabs parsing concurrently. |
| Page reload mid-session | Cascade state resets. First call to a previously-cooled model may 429 once, then re-cool. Worst case ~4 wasted calls per page load (one per cooled model). |
| Quota midnight reset | No automatic detection. User reloads page next day; state reinitialises empty; retries everything. |
| Non-rate-limit Gemini error | `error` carries the message, `rateLimited: false`. Row goes to `failed`. Model is NOT cooled. User can Retry the row. |
| Gemini SDK throws synchronously | Same as above. |
| Preview model regressed output format | Parser already requires `order_id` (string) and `commission_vnd` (number) and coerces `status_name` to `''` — orders missing the required fields are dropped, malformed orders surface as a "missing status" toast in the review pane. Acceptable resilience. |
| All four models exhausted | Per-row `failed` with the all-exhausted error message + global header banner. |

## Testing

### Unit (`src/lib/gemini/__tests__/model-cascade.test.ts`, new file)

`pickNextModel`:
- Returns first preferred model when `lastCallAt` empty and no `cooled` (fresh state).
- Skips a `cooled` model and picks next preferred.
- Returns `null` when every model is cooled.
- Returns `{ waitMs > 0, model: <earliest-ready> }` when all available models are within their cooldown window.
- Respects per-model `minIntervalMs` differences (a model called 5s ago with 13s interval is not picked; one called 5s ago with 5s interval is picked).

`isRateLimitError`:
- Matches `429`, `RESOURCE_EXHAUSTED`, `quota`, `rate limit` (case-insensitive).
- Matches the verbatim Gemini SDK 429 message under "Real-world 429 error format" above (used as a test fixture).
- Does not match unrelated errors (e.g. `Network timeout`, `Invalid input`).
- Tolerates `null` / `undefined` / non-Error throwables.

`markCalled` / `markCooled`: mutate the supplied state correctly.

### Manual smoke

1. **Cold-start cascade** — load `/reports/<id>`, drop 1 image. With `gemini-2.5-flash` already exhausted today, expect: header ticks `4 → 3 of 4 models available`; final badge `✓ N orders · 2.5-lite`.
2. **Burst** — drop 6 images. First 4 should fire near-concurrently across all four models. 5th and 6th show `⏱ Waiting…` for ~5s and ~7s respectively. Badges show distinct models.
3. **All-exhausted banner** — manually achievable only by burning through 560 RPD. Skip in routine smoke; verify the banner via temporary debug toggle if needed.

## Out of Scope

- Persistent quota tracking (localStorage, DB).
- Server-side cascade coordination across function instances or users.
- Configurable cascade order via env var or admin UI.
- Custom retry / backoff logic per model.
- Showing per-model remaining-quota counts in the UI (we don't track them; the dashboard is authoritative).
- Switching to a paid tier or Vercel AI Gateway.
