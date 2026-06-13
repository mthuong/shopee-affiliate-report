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
