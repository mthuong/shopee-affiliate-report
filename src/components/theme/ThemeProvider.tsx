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
    // One-time hydration sync: adopt the theme the pre-paint inline script
    // already wrote to <html data-theme>. Reading it here (not during render)
    // is what avoids an SSR/CSR hydration mismatch, so the synchronous setState
    // is intentional and runs at most once.
    const current = document.documentElement.getAttribute('data-theme')
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
