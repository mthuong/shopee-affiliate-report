import { render, screen } from '@testing-library/react'
import { Heading } from '../Heading'

describe('Heading', () => {
  it('renders the matching heading tag and type class for the level', () => {
    render(<Heading level={2}>Title</Heading>)
    const el = screen.getByRole('heading', { level: 2, name: 'Title' })
    expect(el.className).toContain('type-h2')
    expect(el.className).toContain('text-ink')
  })
  it('defaults to level 1', () => {
    render(<Heading>Top</Heading>)
    expect(screen.getByRole('heading', { level: 1, name: 'Top' }).className).toContain('type-h1')
  })
})
