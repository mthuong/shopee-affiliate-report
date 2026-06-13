import { render, screen } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renders the primary variant with accent fill + pill radius + press scale', () => {
    render(<Button>Save</Button>)
    const el = screen.getByRole('button', { name: 'Save' })
    expect(el.className).toContain('bg-accent')
    expect(el.className).toContain('text-on-accent')
    expect(el.className).toContain('rounded-pill')
    expect(el.className).toContain('active:scale-95')
  })
  it('renders secondary, ghost, and danger variants', () => {
    render(<>
      <Button variant="secondary">a</Button>
      <Button variant="ghost">b</Button>
      <Button variant="danger">c</Button>
    </>)
    expect(screen.getByRole('button', { name: 'a' }).className).toContain('border-line')
    expect(screen.getByRole('button', { name: 'b' }).className).toContain('text-accent')
    expect(screen.getByRole('button', { name: 'c' }).className).toContain('bg-danger')
  })
})
