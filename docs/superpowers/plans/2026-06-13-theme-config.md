# Theme Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user switch the whole app between an **Apple** (light, default) theme and a **Classic** (current dark/orange) theme, where switching changes the full design language — colors, type, density, radius.

**Architecture:** A semantic CSS-variable token contract is redefined under `[data-theme="apple"]` / `[data-theme="classic"]` and mapped into Tailwind v4 via `@theme inline`, so components use role-named utilities (`bg-page`, `text-ink`, `rounded-card`). A blocking inline script sets `data-theme` from `localStorage` before paint (no flash); a `ThemeProvider` + segmented `ThemeToggle` let the user switch. All ~28 components are refactored from hardcoded colors to semantic tokens / primitives.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-13-theme-config-design.md`

> **Note on Next.js version:** This repo runs Next.js 16, which has breaking changes vs. older docs (see `AGENTS.md`). Before editing `src/app/layout.tsx`, skim `node_modules/next/dist/docs/` for the current App Router layout/metadata guidance.

---

## File structure

**Created:**
- `src/app/themes/apple.css` — Apple token values (`:root, [data-theme="apple"]`)
- `src/app/themes/classic.css` — Classic token values (`[data-theme="classic"]`)
- `src/lib/theme/constants.ts` — `THEMES`, `DEFAULT_THEME`, `THEME_STORAGE_KEY`, `Theme` type, `themeInitScript`
- `src/lib/theme/__tests__/constants.test.ts`
- `src/components/theme/ThemeProvider.tsx` — context + `useTheme()`
- `src/components/theme/__tests__/ThemeProvider.test.tsx`
- `src/components/theme/ThemeToggle.tsx` — segmented control
- `src/components/theme/__tests__/ThemeToggle.test.tsx`
- `src/components/ui/primitives/Surface.tsx` + `Card.tsx` + `Heading.tsx` + `Text.tsx` + `Button.tsx` + `Stack.tsx`
- `src/components/ui/primitives/__tests__/*.test.tsx` (one per primitive)
- `eslint-rules/no-hardcoded-colors.mjs` — flat-config rule object (regex guard)

**Modified:**
- `src/app/globals.css` — Tailwind import, theme imports, `@theme inline` mapping, type utility classes, base `body`/`.input`
- `src/app/layout.tsx` — inline script, `<html data-theme>`, `ThemeProvider`, themed nav
- The 28 component files listed in Tasks 7–10 (hardcoded colors → semantic tokens / primitives)
- `eslint.config.mjs` — wire in the guard rule

---

## Token reference (single source of truth)

These names are used verbatim throughout the plan.

**Runtime semantic tokens** (set per `[data-theme]`; never collide with Tailwind namespaces):

| Token | Apple | Classic |
|---|---|---|
| `--surface-page` | `#ffffff` | `#030712` |
| `--surface-raised` | `#ffffff` | `#111827` |
| `--surface-sunken` | `#f5f5f7` | `#1f2937` |
| `--surface-inverse` | `#1d1d1f` | `#f3f4f6` |
| `--ink-default` | `#1d1d1f` | `#f3f4f6` |
| `--ink-muted` | `#7a7a7a` | `#9ca3af` |
| `--ink-on-accent` | `#ffffff` | `#ffffff` |
| `--ink-on-inverse` | `#ffffff` | `#111827` |
| `--accent` | `#0066cc` | `#fb923c` |
| `--accent-hover` | `#0071e3` | `#fdba74` |
| `--accent-on-dark` | `#2997ff` | `#fb923c` |
| `--border-default` | `#e0e0e0` | `#1f2937` |
| `--border-strong` | `#d2d2d7` | `#374151` |
| `--status-success` | `#248a3d` | `#15803d` |
| `--status-danger` | `#d70015` | `#b91c1c` |
| `--status-warning` | `#b25000` | `#b45309` |
| `--rad-control` | `8px` | `8px` |
| `--rad-card` | `18px` | `12px` |
| `--rad-pill` | `9999px` | `9999px` |
| `--family-display` | `"SF Pro Display", system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif` | `"Inter", system-ui, sans-serif` |
| `--family-text` | `"SF Pro Text", system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif` | `"Inter", system-ui, sans-serif` |
| `--type-tracking-tight` | `-0.374px` | `0px` |
| `--type-tracking-body` | `-0.01em` | `0px` |
| `--gutter` | `24px` | `16px` |
| `--pad-card` | `24px` | `16px` |
| `--pad-row` | `12px` | `8px` |
| `--space-section` | `80px` | `32px` |
| `--elev-card` | `none` | `none` |
| `--elev-product` | `rgba(0,0,0,0.22) 3px 5px 30px 0` | `0 10px 15px -3px rgba(0,0,0,0.4)` |

**`@theme inline` mapping → generated utilities:**

| Tailwind theme var → runtime token | Utility examples |
|---|---|
| `--color-page: var(--surface-page)` | `bg-page` |
| `--color-raised: var(--surface-raised)` | `bg-raised` |
| `--color-sunken: var(--surface-sunken)` | `bg-sunken` |
| `--color-inverse: var(--surface-inverse)` | `bg-inverse` |
| `--color-ink: var(--ink-default)` | `text-ink`, `bg-ink` |
| `--color-muted: var(--ink-muted)` | `text-muted` |
| `--color-on-accent: var(--ink-on-accent)` | `text-on-accent` |
| `--color-on-inverse: var(--ink-on-inverse)` | `text-on-inverse` |
| `--color-accent: var(--accent)` | `bg-accent`, `text-accent`, `border-accent` |
| `--color-accent-hover: var(--accent-hover)` | `hover:bg-accent-hover` |
| `--color-accent-on-dark: var(--accent-on-dark)` | `text-accent-on-dark` |
| `--color-line: var(--border-default)` | `border-line` |
| `--color-line-strong: var(--border-strong)` | `border-line-strong` |
| `--color-success: var(--status-success)` | `text-success`, `bg-success` |
| `--color-danger: var(--status-danger)` | `text-danger`, `bg-danger` |
| `--color-warning: var(--status-warning)` | `text-warning` |
| `--radius-control: var(--rad-control)` | `rounded-control` |
| `--radius-card: var(--rad-card)` | `rounded-card` |
| `--radius-pill: var(--rad-pill)` | `rounded-pill` |
| `--font-display: var(--family-display)` | `font-display` |
| `--font-text: var(--family-text)` | `font-text` |
| `--spacing-gutter: var(--gutter)` | `gap-gutter`, `p-gutter` |
| `--spacing-card: var(--pad-card)` | `p-card` |
| `--spacing-row: var(--pad-row)` | `px-row`, `py-row` |
| `--spacing-section: var(--space-section)` | `py-section` |
| `--shadow-card: var(--elev-card)` | `shadow-card` |
| `--shadow-product: var(--elev-product)` | `shadow-product` |

**Color → semantic mapping (used in the refactor tasks):**

| Current hardcoded | Semantic replacement |
|---|---|
| `bg-gray-950` (page/body) | `bg-page` |
| `bg-gray-900` (modal/panel) | `bg-raised` |
| `bg-gray-800` (input/well) | `bg-sunken` |
| `text-gray-100` / `text-white` (primary) | `text-ink` |
| `text-gray-400` / `text-gray-500` (secondary) | `text-muted` |
| `text-orange-400` / `text-orange-300` | `text-accent` |
| `bg-orange-500` / `bg-orange-600` | `bg-accent` |
| `border-orange-500` | `border-accent` |
| `border-gray-800` / `border-gray-700` | `border-line` (use `border-line-strong` for the heavier `gray-700`) |
| `text-green-*` / `bg-green-700` (positive) | `text-success` / `bg-success` |
| `text-red-*` / `bg-red-700` (negative/error) | `text-danger` / `bg-danger` |
| `rounded-lg` (controls) | `rounded-control` |
| `rounded-xl` (cards/modals) | `rounded-card` |
| `bg-black/70` (overlay) | keep — overlay scrim is theme-neutral |

---

## Task 1: Token foundation (globals.css + theme files)

**Files:**
- Create: `src/app/themes/apple.css`
- Create: `src/app/themes/classic.css`
- Modify: `src/app/globals.css` (full rewrite)

- [ ] **Step 1: Create `src/app/themes/apple.css`**

```css
/* Apple theme — light, low-density. Default baseline. */
:root,
[data-theme="apple"] {
  --surface-page: #ffffff;
  --surface-raised: #ffffff;
  --surface-sunken: #f5f5f7;
  --surface-inverse: #1d1d1f;

  --ink-default: #1d1d1f;
  --ink-muted: #7a7a7a;
  --ink-on-accent: #ffffff;
  --ink-on-inverse: #ffffff;

  --accent: #0066cc;
  --accent-hover: #0071e3;
  --accent-on-dark: #2997ff;

  --border-default: #e0e0e0;
  --border-strong: #d2d2d7;

  --status-success: #248a3d;
  --status-danger: #d70015;
  --status-warning: #b25000;

  --rad-control: 8px;
  --rad-card: 18px;
  --rad-pill: 9999px;

  --family-display: "SF Pro Display", system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
  --family-text: "SF Pro Text", system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
  --type-tracking-tight: -0.374px;
  --type-tracking-body: -0.01em;

  --gutter: 24px;
  --pad-card: 24px;
  --pad-row: 12px;
  --space-section: 80px;

  --elev-card: none;
  --elev-product: rgba(0, 0, 0, 0.22) 3px 5px 30px 0;
}
```

- [ ] **Step 2: Create `src/app/themes/classic.css`**

```css
/* Classic theme — current dark / orange Shopee look. */
[data-theme="classic"] {
  --surface-page: #030712;
  --surface-raised: #111827;
  --surface-sunken: #1f2937;
  --surface-inverse: #f3f4f6;

  --ink-default: #f3f4f6;
  --ink-muted: #9ca3af;
  --ink-on-accent: #ffffff;
  --ink-on-inverse: #111827;

  --accent: #fb923c;
  --accent-hover: #fdba74;
  --accent-on-dark: #fb923c;

  --border-default: #1f2937;
  --border-strong: #374151;

  --status-success: #15803d;
  --status-danger: #b91c1c;
  --status-warning: #b45309;

  --rad-control: 8px;
  --rad-card: 12px;
  --rad-pill: 9999px;

  --family-display: "Inter", system-ui, sans-serif;
  --family-text: "Inter", system-ui, sans-serif;
  --type-tracking-tight: 0px;
  --type-tracking-body: 0px;

  --gutter: 16px;
  --pad-card: 16px;
  --pad-row: 8px;
  --space-section: 32px;

  --elev-card: none;
  --elev-product: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 3: Rewrite `src/app/globals.css`**

```css
@import "tailwindcss";
@import "./themes/apple.css";
@import "./themes/classic.css";

@theme inline {
  --color-page: var(--surface-page);
  --color-raised: var(--surface-raised);
  --color-sunken: var(--surface-sunken);
  --color-inverse: var(--surface-inverse);

  --color-ink: var(--ink-default);
  --color-muted: var(--ink-muted);
  --color-on-accent: var(--ink-on-accent);
  --color-on-inverse: var(--ink-on-inverse);

  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-on-dark: var(--accent-on-dark);

  --color-line: var(--border-default);
  --color-line-strong: var(--border-strong);

  --color-success: var(--status-success);
  --color-danger: var(--status-danger);
  --color-warning: var(--status-warning);

  --radius-control: var(--rad-control);
  --radius-card: var(--rad-card);
  --radius-pill: var(--rad-pill);

  --font-display: var(--family-display);
  --font-text: var(--family-text);

  --spacing-gutter: var(--gutter);
  --spacing-card: var(--pad-card);
  --spacing-row: var(--pad-row);
  --spacing-section: var(--space-section);

  --shadow-card: var(--elev-card);
  --shadow-product: var(--elev-product);
}

/* Semantic type roles — referenced by the Heading/Text primitives. */
.type-h1 { font-family: var(--family-display); font-size: 2.5rem;   line-height: 1.1;  font-weight: 600; letter-spacing: var(--type-tracking-tight); }
.type-h2 { font-family: var(--family-display); font-size: 2rem;     line-height: 1.1;  font-weight: 600; letter-spacing: var(--type-tracking-tight); }
.type-h3 { font-family: var(--family-display); font-size: 1.5rem;   line-height: 1.2;  font-weight: 600; letter-spacing: var(--type-tracking-tight); }
.type-h4 { font-family: var(--family-display); font-size: 1.25rem;  line-height: 1.25; font-weight: 600; letter-spacing: var(--type-tracking-tight); }
.type-body    { font-family: var(--family-text); font-size: 1.0625rem; line-height: 1.47; letter-spacing: var(--type-tracking-body); }
.type-caption { font-family: var(--family-text); font-size: 0.875rem;  line-height: 1.43; }

body {
  background: var(--surface-page);
  color: var(--ink-default);
  font-family: var(--family-text);
  min-height: 100vh;
}

.input {
  @apply w-full bg-sunken border border-line rounded-control px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent;
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm build`
Expected: build succeeds (no Tailwind/PostCSS errors). If `@theme inline` errors, confirm Tailwind v4 + `@tailwindcss/postcss` are installed (they are, per `package.json`).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/themes/apple.css src/app/themes/classic.css
git commit -m "feat(theme): add semantic token contract + apple/classic theme files"
```

---

## Task 2: Theme constants + init script

**Files:**
- Create: `src/lib/theme/constants.ts`
- Test: `src/lib/theme/__tests__/constants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/theme/__tests__/constants.test.ts
import { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, themeInitScript } from '../constants'

describe('theme constants', () => {
  it('exposes both themes and an apple default', () => {
    expect(THEMES).toEqual(['apple', 'classic'])
    expect(DEFAULT_THEME).toBe('apple')
    expect(THEME_STORAGE_KEY).toBe('theme')
  })

  it('init script references the storage key and default, and is wrapped in try/catch', () => {
    expect(themeInitScript).toContain("localStorage.getItem('theme')")
    expect(themeInitScript).toContain("'apple'")
    expect(themeInitScript).toContain('data-theme')
    expect(themeInitScript).toContain('try')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest src/lib/theme/__tests__/constants.test.ts`
Expected: FAIL — `Cannot find module '../constants'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/theme/constants.ts
export const THEMES = ['apple', 'classic'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'apple'
export const THEME_STORAGE_KEY = 'theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'apple' || value === 'classic'
}

// Runs before paint in <head> to prevent a flash of the wrong theme.
export const themeInitScript = `
try {
  var t = localStorage.getItem('${THEME_STORAGE_KEY}');
  if (t !== 'apple' && t !== 'classic') t = '${DEFAULT_THEME}';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {
  document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
}
`.trim()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest src/lib/theme/__tests__/constants.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme/constants.ts src/lib/theme/__tests__/constants.test.ts
git commit -m "feat(theme): add theme constants + no-flash init script"
```

---

## Task 3: ThemeProvider

**Files:**
- Create: `src/components/theme/ThemeProvider.tsx`
- Test: `src/components/theme/__tests__/ThemeProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/theme/__tests__/ThemeProvider.test.tsx
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from '../ThemeProvider'

function Probe() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="value">{theme}</span>
      <button onClick={() => setTheme('classic')}>classic</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.setAttribute('data-theme', 'apple')
  })

  it('hydrates the active theme from the <html> data-theme attribute', () => {
    document.documentElement.setAttribute('data-theme', 'classic')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('value')).toHaveTextContent('classic')
  })

  it('setTheme updates context, localStorage, and the html attribute', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('value')).toHaveTextContent('apple')

    await userEvent.click(screen.getByRole('button', { name: 'classic' }))

    expect(screen.getByTestId('value')).toHaveTextContent('classic')
    expect(localStorage.getItem('theme')).toBe('classic')
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest src/components/theme/__tests__/ThemeProvider.test.tsx`
Expected: FAIL — `Cannot find module '../ThemeProvider'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/theme/ThemeProvider.tsx
'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { DEFAULT_THEME, THEME_STORAGE_KEY, isTheme, type Theme } from '@/lib/theme/constants'

type ThemeContextType = { theme: Theme; setTheme: (t: Theme) => void }

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the default so SSR + first client render agree, then hydrate
  // from the DOM attribute the inline script already set (avoids reading
  // localStorage during render, which would mismatch hydration).
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    if (isTheme(current)) setThemeState(current)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t)
    } catch {
      /* storage unavailable — attribute swap still applies for this session */
    }
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest src/components/theme/__tests__/ThemeProvider.test.tsx`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/components/theme/ThemeProvider.tsx src/components/theme/__tests__/ThemeProvider.test.tsx
git commit -m "feat(theme): add ThemeProvider with DOM-attribute hydration"
```

---

## Task 4: ThemeToggle (segmented control)

**Files:**
- Create: `src/components/theme/ThemeToggle.tsx`
- Test: `src/components/theme/__tests__/ThemeToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/theme/__tests__/ThemeToggle.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '../ThemeProvider'
import { ThemeToggle } from '../ThemeToggle'

function setup() {
  localStorage.clear()
  document.documentElement.setAttribute('data-theme', 'apple')
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
}

describe('ThemeToggle', () => {
  it('marks the active theme button as pressed', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Apple' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches the active theme on click', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Classic' }))
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest src/components/theme/__tests__/ThemeToggle.test.tsx`
Expected: FAIL — `Cannot find module '../ThemeToggle'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/theme/ThemeToggle.tsx
'use client'

import { useTheme } from './ThemeProvider'
import { THEMES, type Theme } from '@/lib/theme/constants'

const LABELS: Record<Theme, string> = { apple: 'Apple', classic: 'Classic' }

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="inline-flex rounded-pill border border-line p-0.5" role="group" aria-label="Theme">
      {THEMES.map((t) => {
        const active = theme === t
        return (
          <button
            key={t}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(t)}
            className={`px-3 py-1 text-xs rounded-pill transition-transform active:scale-95 ${
              active ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
            }`}
          >
            {LABELS[t]}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest src/components/theme/__tests__/ThemeToggle.test.tsx`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/components/theme/ThemeToggle.tsx src/components/theme/__tests__/ThemeToggle.test.tsx
git commit -m "feat(theme): add segmented ThemeToggle control"
```

---

## Task 5: Wire into root layout (no-flash + provider + themed nav)

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Read the Next.js 16 layout guidance**

Skim `node_modules/next/dist/docs/` for current root-layout / `<head>` script conventions before editing.

- [ ] **Step 2: Rewrite `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { DEFAULT_THEME, themeInitScript } from '@/lib/theme/constants'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shopee Affiliate Report',
  description: 'Track and manage Shopee affiliate commission',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme={DEFAULT_THEME}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.className} bg-page text-ink min-h-screen`}>
        <ThemeProvider>
          <ToastProvider>
            <nav className="border-b border-line px-6 py-4 flex items-center gap-6">
              <Link href="/" className="text-lg font-bold text-accent">
                📊 Shopee Affiliate
              </Link>
              <Link href="/" className="text-sm text-muted hover:text-ink">Reports</Link>
              <Link href="/clients" className="text-sm text-muted hover:text-ink">Clients</Link>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </nav>
            <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify build + manual no-flash check**

Run: `pnpm build` → Expected: succeeds.
Run: `pnpm dev`, open `http://localhost:3000`. Expected: app loads in **Apple (light)** theme by default; the toggle in the nav switches to Classic (dark) and the choice survives a page reload. No flash of the wrong theme on reload.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(theme): wire provider, no-flash script, and toggle into layout"
```

---

## Task 6: Primitive component layer

Each primitive is its own create-test / fail / implement / pass / commit cycle. Do them in this order: Surface, Card, Heading, Text, Button, Stack.

**Files (create + test for each):** `src/components/ui/primitives/{Surface,Card,Heading,Text,Button,Stack}.tsx` and matching `__tests__/*.test.tsx`.

### 6a: Surface

- [ ] **Step 1: Write the failing test** — `src/components/ui/primitives/__tests__/Surface.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { Surface } from '../Surface'

describe('Surface', () => {
  it('applies the page background by default', () => {
    render(<Surface data-testid="s">x</Surface>)
    expect(screen.getByTestId('s').className).toContain('bg-page')
  })
  it('applies the raised variant and merges custom className', () => {
    render(<Surface variant="raised" className="p-4" data-testid="s">x</Surface>)
    const el = screen.getByTestId('s')
    expect(el.className).toContain('bg-raised')
    expect(el.className).toContain('p-4')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module '../Surface'`)

Run: `pnpm jest src/components/ui/primitives/__tests__/Surface.test.tsx`

- [ ] **Step 3: Implement** — `src/components/ui/primitives/Surface.tsx`

```tsx
type SurfaceVariant = 'page' | 'raised' | 'sunken' | 'inverse'

const BG: Record<SurfaceVariant, string> = {
  page: 'bg-page text-ink',
  raised: 'bg-raised text-ink',
  sunken: 'bg-sunken text-ink',
  inverse: 'bg-inverse text-on-inverse',
}

type Props = React.HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }

export function Surface({ variant = 'page', className = '', ...rest }: Props) {
  return <div className={`${BG[variant]} ${className}`.trim()} {...rest} />
}
```

- [ ] **Step 4: Run → PASS**

Run: `pnpm jest src/components/ui/primitives/__tests__/Surface.test.tsx`

- [ ] **Step 5: Commit** — `git add src/components/ui/primitives/Surface.tsx src/components/ui/primitives/__tests__/Surface.test.tsx && git commit -m "feat(theme): add Surface primitive"`

### 6b: Card

- [ ] **Step 1: Write the failing test** — `__tests__/Card.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { Card } from '../Card'

describe('Card', () => {
  it('renders a raised, hairline, rounded card', () => {
    render(<Card data-testid="c">body</Card>)
    const el = screen.getByTestId('c')
    expect(el.className).toContain('bg-raised')
    expect(el.className).toContain('border-line')
    expect(el.className).toContain('rounded-card')
    expect(el.className).toContain('p-card')
  })
})
```

- [ ] **Step 2: Run → FAIL.** Run: `pnpm jest src/components/ui/primitives/__tests__/Card.test.tsx`

- [ ] **Step 3: Implement** — `Card.tsx`

```tsx
type Props = React.HTMLAttributes<HTMLDivElement>

export function Card({ className = '', ...rest }: Props) {
  return (
    <div
      className={`bg-raised text-ink border border-line rounded-card p-card shadow-card ${className}`.trim()}
      {...rest}
    />
  )
}
```

- [ ] **Step 4: Run → PASS.** Run: `pnpm jest src/components/ui/primitives/__tests__/Card.test.tsx`

- [ ] **Step 5: Commit** — `git add src/components/ui/primitives/Card.tsx src/components/ui/primitives/__tests__/Card.test.tsx && git commit -m "feat(theme): add Card primitive"`

### 6c: Heading

- [ ] **Step 1: Write the failing test** — `__tests__/Heading.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { Heading } from '../Heading'

describe('Heading', () => {
  it('renders the matching heading tag and type class for the level', () => {
    render(<Heading level={2}>Title</Heading>)
    const el = screen.getByRole('heading', { level: 2, name: 'Title' })
    expect(el.className).toContain('type-h2')
    expect(el.className).toContain('text-ink')
  })
  it('defaults to level 1', () => {
    render(<Heading>Top</Heading>)
    expect(screen.getByRole('heading', { level: 1, name: 'Top' }).className).toContain('type-h1')
  })
})
```

- [ ] **Step 2: Run → FAIL.** Run: `pnpm jest src/components/ui/primitives/__tests__/Heading.test.tsx`

- [ ] **Step 3: Implement** — `Heading.tsx`

```tsx
type Level = 1 | 2 | 3 | 4
type Props = React.HTMLAttributes<HTMLHeadingElement> & { level?: Level }

export function Heading({ level = 1, className = '', ...rest }: Props) {
  const Tag = `h${level}` as const
  return <Tag className={`type-h${level} text-ink ${className}`.trim()} {...rest} />
}
```

- [ ] **Step 4: Run → PASS.** Run: `pnpm jest src/components/ui/primitives/__tests__/Heading.test.tsx`

- [ ] **Step 5: Commit** — `git add src/components/ui/primitives/Heading.tsx src/components/ui/primitives/__tests__/Heading.test.tsx && git commit -m "feat(theme): add Heading primitive"`

### 6d: Text

- [ ] **Step 1: Write the failing test** — `__tests__/Text.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { Text } from '../Text'

describe('Text', () => {
  it('renders body text by default', () => {
    render(<Text data-testid="t">hi</Text>)
    const el = screen.getByTestId('t')
    expect(el.className).toContain('type-body')
    expect(el.className).toContain('text-ink')
  })
  it('renders muted and caption variants', () => {
    render(<><Text variant="muted" data-testid="m">m</Text><Text variant="caption" data-testid="c">c</Text></>)
    expect(screen.getByTestId('m').className).toContain('text-muted')
    expect(screen.getByTestId('c').className).toContain('type-caption')
  })
})
```

- [ ] **Step 2: Run → FAIL.** Run: `pnpm jest src/components/ui/primitives/__tests__/Text.test.tsx`

- [ ] **Step 3: Implement** — `Text.tsx`

```tsx
type TextVariant = 'body' | 'muted' | 'caption'

const STYLES: Record<TextVariant, string> = {
  body: 'type-body text-ink',
  muted: 'type-body text-muted',
  caption: 'type-caption text-muted',
}

type Props = React.HTMLAttributes<HTMLParagraphElement> & { variant?: TextVariant }

export function Text({ variant = 'body', className = '', ...rest }: Props) {
  return <p className={`${STYLES[variant]} ${className}`.trim()} {...rest} />
}
```

- [ ] **Step 4: Run → PASS.** Run: `pnpm jest src/components/ui/primitives/__tests__/Text.test.tsx`

- [ ] **Step 5: Commit** — `git add src/components/ui/primitives/Text.tsx src/components/ui/primitives/__tests__/Text.test.tsx && git commit -m "feat(theme): add Text primitive"`

### 6e: Button

- [ ] **Step 1: Write the failing test** — `__tests__/Button.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renders the primary variant with accent fill + pill radius + press scale', () => {
    render(<Button>Save</Button>)
    const el = screen.getByRole('button', { name: 'Save' })
    expect(el.className).toContain('bg-accent')
    expect(el.className).toContain('text-on-accent')
    expect(el.className).toContain('rounded-pill')
    expect(el.className).toContain('active:scale-95')
  })
  it('renders secondary, ghost, and danger variants', () => {
    render(<>
      <Button variant="secondary">a</Button>
      <Button variant="ghost">b</Button>
      <Button variant="danger">c</Button>
    </>)
    expect(screen.getByRole('button', { name: 'a' }).className).toContain('border-line')
    expect(screen.getByRole('button', { name: 'b' }).className).toContain('text-accent')
    expect(screen.getByRole('button', { name: 'c' }).className).toContain('bg-danger')
  })
})
```

- [ ] **Step 2: Run → FAIL.** Run: `pnpm jest src/components/ui/primitives/__tests__/Button.test.tsx`

- [ ] **Step 3: Implement** — `Button.tsx`

```tsx
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-raised text-ink border border-line hover:border-line-strong',
  ghost: 'bg-transparent text-accent hover:text-accent-hover',
  danger: 'bg-danger text-on-accent hover:opacity-90',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
      {...rest}
    />
  )
}
```

- [ ] **Step 4: Run → PASS.** Run: `pnpm jest src/components/ui/primitives/__tests__/Button.test.tsx`

- [ ] **Step 5: Commit** — `git add src/components/ui/primitives/Button.tsx src/components/ui/primitives/__tests__/Button.test.tsx && git commit -m "feat(theme): add Button primitive"`

### 6f: Stack

- [ ] **Step 1: Write the failing test** — `__tests__/Stack.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { Stack } from '../Stack'

describe('Stack', () => {
  it('lays out a vertical flex with the themed gutter by default', () => {
    render(<Stack data-testid="s"><span>a</span></Stack>)
    const el = screen.getByTestId('s')
    expect(el.className).toContain('flex')
    expect(el.className).toContain('flex-col')
    expect(el.className).toContain('gap-gutter')
  })
  it('supports a horizontal direction', () => {
    render(<Stack direction="row" data-testid="s"><span>a</span></Stack>)
    expect(screen.getByTestId('s').className).toContain('flex-row')
  })
})
```

- [ ] **Step 2: Run → FAIL.** Run: `pnpm jest src/components/ui/primitives/__tests__/Stack.test.tsx`

- [ ] **Step 3: Implement** — `Stack.tsx`

```tsx
type Props = React.HTMLAttributes<HTMLDivElement> & { direction?: 'row' | 'col' }

export function Stack({ direction = 'col', className = '', ...rest }: Props) {
  const dir = direction === 'row' ? 'flex-row' : 'flex-col'
  return <div className={`flex ${dir} gap-gutter ${className}`.trim()} {...rest} />
}
```

- [ ] **Step 4: Run → PASS.** Run: `pnpm jest src/components/ui/primitives/__tests__/Stack.test.tsx`

- [ ] **Step 5: Commit** — `git add src/components/ui/primitives/Stack.tsx src/components/ui/primitives/__tests__/Stack.test.tsx && git commit -m "feat(theme): add Stack primitive"`

---

## Task 7: Refactor shared UI (Modal, ConfirmModal, Toast)

These are mechanical color swaps using the **Color → semantic mapping** table above. Existing behavior tests must keep passing.

**Files:**
- Modify: `src/components/ui/Modal.tsx`
- Modify: `src/components/ui/ConfirmModal.tsx`
- Modify: `src/components/ui/Toast.tsx`

- [ ] **Step 1: Refactor `Modal.tsx`**

Replace the panel line. Before:
```tsx
<div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
```
After:
```tsx
<div className="bg-raised text-ink border border-line-strong rounded-card p-6 w-full max-w-md">
```
Keep the overlay `bg-black/70` (theme-neutral scrim).

- [ ] **Step 2: Refactor `ConfirmModal.tsx`**

Read the file, then apply the mapping table to every `bg-gray-*`/`text-gray-*`/`bg-red-*`/`bg-orange-*`/`border-gray-*` class: panels → `bg-raised`/`border-line`, primary/confirm buttons → `bg-accent text-on-accent` (or `bg-danger text-on-accent` for destructive confirms), secondary → `bg-sunken text-ink`, body copy → `text-ink`/`text-muted`.

- [ ] **Step 3: Refactor `Toast.tsx`**

Before:
```tsx
<div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm ${t.type === 'error' ? 'bg-red-700' : 'bg-green-700'} text-white`}>
```
After:
```tsx
<div key={t.id} className={`px-4 py-3 rounded-control shadow-lg text-sm ${t.type === 'error' ? 'bg-danger' : 'bg-success'} text-on-accent`}>
```

- [ ] **Step 4: Run the related tests + build**

Run: `pnpm jest src/components/reports/__tests__/PendingOrdersReview.test.tsx` (exercises Toast/modals indirectly) and `pnpm build`.
Expected: tests PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Modal.tsx src/components/ui/ConfirmModal.tsx src/components/ui/Toast.tsx
git commit -m "refactor(theme): move shared UI to semantic tokens"
```

---

## Task 8–10: Refactor feature components to semantic tokens

Apply the **Color → semantic mapping** table to every remaining file. Rules for all three tasks:

- Swap colors per the mapping table. Do **not** change layout/markup/logic.
- Where a button/card is being recolored, prefer composing the `Button`/`Card`/`Heading`/`Text` primitives from Task 6 when it's a drop-in; otherwise just swap to semantic utility classes.
- After each task: run that area's existing tests + `pnpm build`, then commit.
- Verify zero hardcoded colors remain in the touched files:
  `grep -nE 'bg-(gray|orange|red|green|blue|zinc|neutral)|text-(gray|orange|red|green|blue)|border-(gray|orange)' <file>` → expected: no output (except an intentional `bg-black/NN` scrim).

### Task 8: Shell + reports area

**Files (modify):**
`src/app/page.tsx`, `src/app/reports/[id]/page.tsx`, `src/app/reports/[id]/ReportDetailClient.tsx`,
`src/components/reports/ReportCard.tsx`, `CreateReportButton.tsx`, `CreateReportModal.tsx`,
`RenameReportButton.tsx`, `RenameReportModal.tsx`, `CsvUploader.tsx`, `ImageCropper.tsx`,
`ImageUploader.tsx`, `PendingOrdersReview.tsx`, `UploadQueue.tsx`

- [ ] **Step 1:** Refactor each file above using the mapping table (colors only; markup unchanged).
- [ ] **Step 2:** Run reports tests.
  Run: `pnpm jest src/components/reports`
  Expected: PASS (`PendingOrdersReview`, `ImageCropper`, `CsvUploader` suites green).
- [ ] **Step 3:** `pnpm build` → Expected: succeeds.
- [ ] **Step 4:** Run the grep guard (above) over each touched file → Expected: no output.
- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/reports src/components/reports
git commit -m "refactor(theme): move reports area to semantic tokens"
```

### Task 9: Clients area

**Files (modify):**
`src/app/clients/page.tsx`, `src/app/clients/[id]/page.tsx`, `src/app/clients/[id]/ClientDetailClient.tsx`,
`src/components/clients/ClientCard.tsx`, `ClientMonthSection.tsx`, `CreateClientButton.tsx`

- [ ] **Step 1:** Refactor each file using the mapping table.
- [ ] **Step 2:** Run clients tests.
  Run: `pnpm jest src/components/clients src/app/clients`
  Expected: PASS (`ClientCard`, `ClientDetailClient` suites green).
- [ ] **Step 3:** `pnpm build` → Expected: succeeds.
- [ ] **Step 4:** Run the grep guard over each touched file → Expected: no output.
- [ ] **Step 5: Commit**

```bash
git add src/app/clients src/components/clients
git commit -m "refactor(theme): move clients area to semantic tokens"
```

### Task 10: Orders area

**Files (modify):**
`src/components/orders/OrdersTable.tsx`, `OrderModal.tsx`, `AssignClientButton.tsx`,
`AssignClientPopup.tsx`, `SelectActionBar.tsx`

- [ ] **Step 1:** Refactor each file using the mapping table. For `OrdersTable`, map row hover/zebra `bg-gray-*` to `bg-sunken`/`hover:bg-sunken` and header text to `text-muted`.
- [ ] **Step 2:** Run orders tests.
  Run: `pnpm jest src/actions/__tests__/orders.test.ts`
  Expected: PASS (logic unaffected).
- [ ] **Step 3:** `pnpm build` → Expected: succeeds.
- [ ] **Step 4:** Run the grep guard over each touched file → Expected: no output.
- [ ] **Step 5: Commit**

```bash
git add src/components/orders
git commit -m "refactor(theme): move orders area to semantic tokens"
```

---

## Task 11: ESLint regression guard

Prevent hardcoded color classes from creeping back into `src/components` and `src/app`.

**Files:**
- Create: `eslint-rules/no-hardcoded-colors.mjs`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Create the rule** — `eslint-rules/no-hardcoded-colors.mjs`

```js
// Flags hardcoded Tailwind color utilities in JSX string literals.
// Use semantic tokens instead (bg-page, text-ink, text-accent, border-line, …).
const FORBIDDEN = /\b(?:bg|text|border)-(?:gray|zinc|neutral|slate|orange|red|green|blue)-\d{2,3}\b/

export default {
  rules: {
    'no-hardcoded-colors': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow hardcoded Tailwind color classes; use semantic theme tokens.' },
        schema: [],
        messages: { hardcoded: 'Hardcoded color class "{{ match }}". Use a semantic token (e.g. bg-page, text-ink, text-accent, border-line).' },
      },
      create(context) {
        function check(node, value) {
          if (typeof value !== 'string') return
          const m = value.match(FORBIDDEN)
          if (m) context.report({ node, messageId: 'hardcoded', data: { match: m[0] } })
        }
        return {
          Literal(node) { check(node, node.value) },
          TemplateElement(node) { check(node, node.value.raw) },
        }
      },
    },
  },
}
```

- [ ] **Step 2: Wire it into `eslint.config.mjs`**

Add the import and a scoped config block:

```js
import themeRules from './eslint-rules/no-hardcoded-colors.mjs'
```

Then append to the `defineConfig([...])` array (after the existing entries, before `globalIgnores`):

```js
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    plugins: { theme: themeRules },
    rules: { 'theme/no-hardcoded-colors': 'error' },
  },
```

- [ ] **Step 3: Run lint to verify it passes on the migrated code**

Run: `pnpm lint`
Expected: PASS — no `theme/no-hardcoded-colors` errors (all colors were migrated in Tasks 7–10). If any fire, fix those files with the mapping table.

- [ ] **Step 4: Verify the rule actually catches a violation**

Temporarily add `<div className="bg-gray-900" />` to any component, run `pnpm lint`, confirm it errors, then remove the line.

- [ ] **Step 5: Commit**

```bash
git add eslint-rules/no-hardcoded-colors.mjs eslint.config.mjs
git commit -m "chore(theme): add eslint guard against hardcoded color classes"
```

---

## Task 12: Full verification pass

- [ ] **Step 1: Whole suite + lint + build**

Run: `pnpm jest && pnpm lint && pnpm build`
Expected: all tests pass, no lint errors, build succeeds.

- [ ] **Step 2: Manual visual pass in both themes**

Run `pnpm dev`. For each route — `/`, `/reports/[id]`, `/clients`, `/clients/[id]` — toggle Apple ↔ Classic and confirm:
- Apple: light surfaces, near-black ink, blue accent, airy spacing, hairline cards — no stranded dark panels/tables on white.
- Classic: matches today's dark/orange look.
- Toggle choice persists across reload; no flash of the wrong theme on reload.
- Text contrast is legible in both themes (spot-check muted text, table headers, disabled buttons).

- [ ] **Step 3: Final commit (if any visual fixes were needed)**

```bash
git add -A
git commit -m "fix(theme): visual polish from cross-theme review"
```

---

## Self-review notes (author check)

- **Spec coverage:** Section 1 tokens → Task 1; Section 2 switching → Tasks 2–5; Section 3 primitives → Task 6; Section 4 refactor order + guardrail → Tasks 7–11; Section 5 testing → per-task tests + Task 12. All spec sections map to tasks.
- **Default = Apple** is enforced in `apple.css` (`:root` baseline), `DEFAULT_THEME`, the init script, and `<html data-theme="apple">`.
- **Out-of-scope items** (DB persistence, cookies, OS preference, SF Pro bundling) are intentionally absent.
- **Type consistency:** `Theme`, `THEMES`, `DEFAULT_THEME`, `THEME_STORAGE_KEY`, `themeInitScript`, `isTheme`, `useTheme`, primitive prop names (`variant`, `level`, `direction`, `size`) are used identically across tasks.
