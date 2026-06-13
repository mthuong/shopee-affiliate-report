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
