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
