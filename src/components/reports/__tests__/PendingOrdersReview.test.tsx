import { render, screen } from '@testing-library/react'
import { PendingOrdersReview } from '../PendingOrdersReview'
import type { EditableOrder } from '../PendingOrdersReview'
import type { OrderStatus } from '@/lib/supabase/types'

// Mock server actions used by PendingOrdersReview
jest.mock('@/actions/orders', () => ({
  createOrders: jest.fn(),
}))
jest.mock('@/actions/parse', () => ({
  resolveStatusId: jest.fn(),
}))

// Mock useToast to avoid needing the ToastProvider context
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}))

const STATUSES: OrderStatus[] = [
  { id: 1, name: 'Đã hoàn thành' },
  { id: 2, name: 'Đã hủy' },
]

function makeOrder(overrides: Partial<EditableOrder> = {}): EditableOrder {
  return {
    _key: 'key-1',
    order_id: 'ORD001',
    product_name: 'Test product',
    status_name: 'Đã hoàn thành',
    commission_vnd: 10000,
    ordered_at: '2026-05-20T08:57:20',
    ...overrides,
  }
}

const defaultProps = {
  reportId: 'report-1',
  statuses: STATUSES,
  onChange: jest.fn(),
  onRemove: jest.fn(),
  onSaved: jest.fn(),
  onDiscard: jest.fn(),
}

describe('PendingOrdersReview', () => {
  it('renders a known status without red border or unrecognized option', () => {
    render(
      <PendingOrdersReview
        {...defaultProps}
        orders={[makeOrder({ status_name: 'Đã hoàn thành' })]}
      />
    )
    const select = screen.getByRole('combobox')
    expect(select.className).not.toMatch(/border-red-500/)
    expect(screen.queryByText(/unrecognized/i)).not.toBeInTheDocument()
  })

  it('renders a blank status_name with red border and placeholder option', () => {
    render(
      <PendingOrdersReview
        {...defaultProps}
        orders={[makeOrder({ status_name: '' })]}
      />
    )
    const select = screen.getByRole('combobox')
    expect(select.className).toMatch(/border-red-500/)
    expect(screen.getByText('— Choose status —')).toBeInTheDocument()
  })

  it('renders an unrecognized status with red border and an "(unrecognized)" option', () => {
    render(
      <PendingOrdersReview
        {...defaultProps}
        orders={[makeOrder({ status_name: 'Pending' })]}
      />
    )
    const select = screen.getByRole('combobox')
    // Red border should be present
    expect(select.className).toMatch(/border-red-500/)
    // An option labelled "<value> (unrecognized)" should be rendered
    expect(screen.getByText('Pending (unrecognized)')).toBeInTheDocument()
  })

  it('does not render a blank placeholder for an unrecognized (non-blank) status', () => {
    render(
      <PendingOrdersReview
        {...defaultProps}
        orders={[makeOrder({ status_name: 'Pending' })]}
      />
    )
    expect(screen.queryByText('— Choose status —')).not.toBeInTheDocument()
  })
})
