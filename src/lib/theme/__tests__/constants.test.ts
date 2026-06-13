import { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, themeInitScript, isTheme } from '../constants'

describe('theme constants', () => {
  it('exposes both themes and an apple default', () => {
    expect(THEMES).toEqual(['apple', 'classic'])
    expect(DEFAULT_THEME).toBe('apple')
    expect(THEME_STORAGE_KEY).toBe('theme')
  })

  it('isTheme accepts known themes and rejects everything else', () => {
    expect(isTheme('apple')).toBe(true)
    expect(isTheme('classic')).toBe(true)
    expect(isTheme('shopee')).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(undefined)).toBe(false)
  })

  it('init script guards every theme in THEMES', () => {
    for (const t of THEMES) {
      expect(themeInitScript).toContain(`t !== '${t}'`)
    }
  })

  it('init script references the storage key and default, and is wrapped in try/catch', () => {
    expect(themeInitScript).toContain("localStorage.getItem('theme')")
    expect(themeInitScript).toContain("'apple'")
    expect(themeInitScript).toContain('data-theme')
    expect(themeInitScript).toContain('try')
  })
})
