import { render, screen } from '@testing-library/react'
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
