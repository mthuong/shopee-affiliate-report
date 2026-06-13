# Theme Config — Design Spec

**Date:** 2026-06-13
**Status:** Approved (design); pending implementation plan
**Source task:** `docs/tasks/theme-config.txt`

## Goal

Add a theme system so a user can switch the entire app between two named themes:

- **Apple** — a light, low-density, photography-first aesthetic derived from
  `docs/Apple-style Design System/`. **This is the default.**
- **Classic** — the current dark / orange Shopee look, preserved as an opt-in.

Switching themes re-skins the **whole app** (all ~28 components) and changes the
**full design language**: colors, type scale, spacing/density, and radius grammar.

## Context & constraints

- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase.
  A data-dashboard app (reports, clients, orders tables) — not a marketing site.
- **Today there is no theme system.** Colors are hardcoded Tailwind utility
  classes (`bg-gray-950`, `text-orange-400`, `bg-gray-800`, …) across ~28 files
  / ~210 usages. `globals.css` defines `--background`/`--foreground` vars that
  are effectively unused (the layout hardcodes `bg-gray-950 text-gray-100`).
- For a toggle to actually re-skin the app, components must reference **semantic
  tokens** rather than hardcoded colors. This requires touching every component
  once.
- **Persistence:** `localStorage`, per-device. No DB, no cookie.
- **No new font downloads:** both themes resolve through the Inter already
  loaded via `next/font`; Apple prefers `system-ui`/`-apple-system` (real SF Pro
  on Apple devices) via the `--font-*` token swap.

## Architecture overview

A **semantic token contract** (theme-neutral variable names) sits between
components and concrete values. Components name a *role* (`bg-page`,
`text-muted`, `rounded-card`); each theme supplies the values. A single
`data-theme` attribute on `<html>` selects the active value set; CSS variables
cascade so the swap re-skins everything without re-rendering the React tree.

```
Component  →  semantic utility (bg-page)  →  --surface-page  →  per-theme value
                                                          ([data-theme="apple"|"classic"])
```

The blend chosen: **semantic token foundation + a thin primitive component
layer**. Tokens are the single source of truth; primitives encapsulate the
structural/density differences (gallery vs dense dashboard) that recolored
utilities alone can't express.

---

## Section 1 — Token architecture

### Semantic token contract (both themes must fill)

| Group | Tokens |
|---|---|
| Surfaces | `--surface-page`, `--surface-raised` (cards/modals), `--surface-sunken` (inputs/wells), `--surface-inverse` |
| Text | `--text-default`, `--text-muted`, `--text-on-accent`, `--text-on-inverse` |
| Accent | `--accent`, `--accent-hover`, `--accent-on-dark` |
| Lines | `--border-default` (hairline), `--border-strong` |
| Status | `--status-success`, `--status-danger`, `--status-warning` |
| Radius | `--radius-control`, `--radius-card`, `--radius-pill` |
| Type | `--font-display`, `--font-text` + scale roles (`--text-heading-1..4`, `--text-body`, `--text-caption`) |
| Density | `--gutter`, `--pad-card`, `--pad-row`, `--space-section` |
| Elevation | `--shadow-card`, `--shadow-product` |

### Per-theme values

- **Apple** — white (`#ffffff`) / parchment (`#f5f5f7`) surfaces, ink `#1d1d1f`,
  muted `#7a7a7a`, accent `#0066cc` (`--accent-hover` `#0071e3`,
  `--accent-on-dark` `#2997ff`), hairline `#e0e0e0`, radii 18px card / pill CTA /
  8px control, fonts `"SF Pro Display"/"SF Pro Text" → system-ui → Inter`,
  generous density (`--space-section: 80px`, `--pad-card: 24px`), no card shadow
  (`--shadow-card: none`) plus the single product shadow
  (`rgba(0,0,0,0.22) 3px 5px 30px`). Values lifted from
  `docs/Apple-style Design System/tokens/*`.
- **Classic** — surfaces `gray-950`/`gray-800`, text `gray-100` / muted
  `gray-400`, orange accent (matching today's `orange-400`/`orange-500`),
  borders `gray-800`, tighter radii, Inter, dense paddings. Values
  reverse-mapped from the current hardcoded classes so this theme reproduces
  today's look exactly.

### Tailwind v4 wiring

In `globals.css`, `@theme inline` maps Tailwind's `--color-*` / `--radius-*` /
`--font-*` / `--spacing-*` onto the semantic vars, generating utilities such as
`bg-page`, `bg-raised`, `bg-sunken`, `text-default`, `text-muted`,
`border-default`, `rounded-card`, `rounded-pill`, `font-display`, `p-card`. The
semantic vars are redefined under `[data-theme="apple"]` and
`[data-theme="classic"]`.

### Files

```
src/app/globals.css        # @import tailwindcss + theme files; @theme inline mapping; base body styles
src/app/themes/apple.css   # [data-theme="apple"]   { …token values }
src/app/themes/classic.css # [data-theme="classic"] { …token values }
```

---

## Section 2 — Theme switching mechanism

- **Storage:** `localStorage["theme"]` ∈ `{ "apple", "classic" }`. Unset → `"apple"`.
- **No-flash inline script** in the root layout `<head>`, blocking, runs before
  paint:

  ```html
  <script dangerouslySetInnerHTML={{ __html: `
    try {
      var t = localStorage.getItem('theme') || 'apple';
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) { document.documentElement.setAttribute('data-theme', 'apple'); }
  `}} />
  ```

  `<html>` also carries a static `data-theme="apple"` default so SSR markup is
  consistent.
- **React state:** `ThemeProvider` (client) hydrates from the DOM attribute on
  mount (not from localStorage — avoids hydration mismatch), exposes
  `{ theme, setTheme }`. `setTheme` writes `localStorage` **and** sets
  `document.documentElement` `data-theme`. CSS-var cascade does the visual work;
  context just keeps the toggle in sync.
- **Toggle UI:** a small **segmented control** ("Apple / Classic"), right-aligned
  in the existing top nav, sentence-case labels, accent on the active segment,
  driven by `useTheme()`.
- **Fonts:** no new downloads — driven by the `--font-*` token swap.

### Files

```
src/components/theme/ThemeProvider.tsx   # context + setTheme
src/components/theme/ThemeToggle.tsx     # segmented control in nav
src/lib/theme/constants.ts               # THEMES, DEFAULT_THEME, storage key
```

---

## Section 3 — Primitive component layer

```
src/components/ui/primitives/
  Surface.tsx   Card.tsx   Heading.tsx   Text.tsx   Button.tsx   Stack.tsx
```

- **`Surface`** — page/section wrapper. Variant `page | raised | sunken |
  inverse`. Applies `bg-*` + `--pad-*`/`--space-section`. Home of Apple's airy
  sections vs Classic's tight padding.
- **`Card`** — `surface-raised` + `rounded-card` + `border-default` hairline +
  `p-card`. Apple: hairline, no shadow. Classic: `gray-800` border on dark fill.
- **`Heading`** — `level` 1–4 → type-scale roles (`--text-heading-*`),
  `font-display`, correct weight/tracking (Apple negative tracking; Classic
  neutral).
- **`Text`** — `variant` `body | muted | caption`, `font-text`.
- **`Button`** — `variant` `primary | secondary | ghost | danger`, `size`.
  Primary = `accent` fill + `rounded-pill` (Apple) / tighter radius (Classic) +
  `transform: scale(0.95)` press micro-interaction. Replaces scattered
  orange/gray button classes.
- **`Stack`** — flex/grid helper using `--gutter`.

**Boundary rule:** primitives own *color, type, radius, elevation, density*;
feature components own *layout & content* and compose primitives. Where a
feature needs raw utilities, it uses **semantic** ones (`bg-page`, `text-muted`)
— never `bg-gray-950`. Each primitive ships with a Jest + RTL test.

---

## Section 4 — Component refactor strategy

~210 hardcoded color usages across ~28 files. Migrate lowest-blast-radius first:

1. **Foundation** — token files, `@theme` wiring, provider, toggle, inline
   script. App still renders; Classic mirrors today's look exactly, so this step
   is visually a no-op even as the default flips to Apple.
2. **Shared UI** — `Modal`, `ConfirmModal`, `Toast`, the `.input` class → primitives /
   semantic tokens. High reuse; validates the system.
3. **Shell** — `layout.tsx` nav + `<main>` → `Surface`/semantic tokens; the
   `bg-gray-950 text-gray-100` on `<body>` becomes token-driven.
4. **Feature components** — reports, clients, orders (tables, cards, modals,
   uploaders) in dependency order; one commit-sized chunk per file/group.

**Mapping reference** (built once, applied mechanically), e.g.:

| Current | Semantic |
|---|---|
| `bg-gray-950` | `bg-page` |
| `bg-gray-800` | `bg-sunken` / `bg-raised` |
| `text-gray-100` | `text-default` |
| `text-gray-400` | `text-muted` |
| `text-orange-400`, `border-orange-500` | `text-accent`, `border-accent` |
| `border-gray-800` | `border-default` |
| status reds / greens | `text-status-danger` / `text-status-success` |

**Guardrail:** an ESLint rule (or `lint-staged` grep) flags raw
`bg-gray-*`/`text-orange-*`/etc. in `src/components` and `src/app` after
migration, so hardcoded colors can't regress. Extends existing
`eslint.config.mjs`.

---

## Section 5 — Testing & verification

- **Unit (Jest + RTL):** each primitive (variants → classes, prop/`className`
  forwarding); `ThemeProvider` (default = apple; `setTheme` writes localStorage +
  sets `data-theme`); toggle reflects/changes active theme.
- **No-flash check:** assert the inline script sets `data-theme` and `<html>`
  carries a consistent default attribute.
- **Regression guard:** the lint rule above; existing test suite stays green.
- **Manual visual pass:** load `/`, `/reports/[id]`, `/clients`,
  `/clients/[id]` in both themes — confirm coherence (no stranded dark tables on
  white, contrast holds, toggle persists across reload).
- **No snapshot tests** on feature components (too brittle against a re-skin).

---

## Out of scope (YAGNI)

- DB / per-user / cross-device theme persistence.
- Cookie-based SSR theme read.
- OS `prefers-color-scheme` auto-selection.
- A third theme or user-customizable token values.
- Real SF Pro web-font bundling (licensing; Inter fallback is used).
- Layout/density changes beyond what the density tokens + primitives express.
