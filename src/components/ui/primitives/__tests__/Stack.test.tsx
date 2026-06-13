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
