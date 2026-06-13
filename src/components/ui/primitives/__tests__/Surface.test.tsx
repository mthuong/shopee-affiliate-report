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
