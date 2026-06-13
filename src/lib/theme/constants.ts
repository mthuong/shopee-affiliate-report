export const THEMES = ['apple', 'classic'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'apple'
export const THEME_STORAGE_KEY = 'theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

// Runs before paint in <head> to prevent a flash of the wrong theme.
// The valid-theme guard is generated from THEMES so it never drifts.
const invalidThemeCheck = THEMES.map((t) => `t !== '${t}'`).join(' && ')

export const themeInitScript = `
try {
  var t = localStorage.getItem('${THEME_STORAGE_KEY}');
  if (${invalidThemeCheck}) t = '${DEFAULT_THEME}';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {
  document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
}
`.trim()
