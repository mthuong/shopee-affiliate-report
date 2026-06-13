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
