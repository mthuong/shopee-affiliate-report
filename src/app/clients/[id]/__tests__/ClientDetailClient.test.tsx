import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ClientDetailClient } from '../ClientDetailClient'

jest.mock('@/actions/clients', () => ({
  __esModule: true,
  getClientReportGroups: jest.fn(),
}))

// ClientMonthSection pulls in server actions + toast; stub it to a simple marker
// so this test focuses on pagination behavior.
jest.mock('@/components/clients/ClientMonthSection', () => ({
  __esModule: true,
  ClientMonthSection: ({ report }: { report: { id: string; name: string } }) => (
    <div data-testid="month-section">{report.name}</div>
  ),
}))

import { getClientReportGroups } from '@/actions/clients'
const mockGet = getClientReportGroups as jest.Mock

const client = { id: 'c1', name: 'Mie Closet', created_at: '2026-01-01T00:00:00Z' }

function group(id: string, name: string) {
  return { report: { id, name, created_at: `${name}` }, orders: [], commissionPercent: 50 }
}

const reportList = [
  { report_id: 'r3', report_name: 'Jun', created_at: '2026-06-01T00:00:00Z', commission: 0, return: 0 },
  { report_id: 'r2', report_name: 'May', created_at: '2026-05-01T00:00:00Z', commission: 0, return: 0 },
  { report_id: 'r1', report_name: 'Apr', created_at: '2026-04-01T00:00:00Z', commission: 0, return: 0 },
]

beforeEach(() => mockGet.mockReset())

function renderComponent() {
  render(
    <ClientDetailClient
      client={client}
      clientId="c1"
      reportList={reportList}
      initialGroups={[group('r3', 'Jun'), group('r2', 'May')]}
      statuses={[]}
      allClients={[]}
      totalCommission={0}
      totalReturn={0}
    />
  )
}

describe('ClientDetailClient pagination', () => {
  it('renders the initial 2 report sections and a Load more button', () => {
    renderComponent()
    expect(screen.getAllByTestId('month-section')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument()
  })

  it('appends the next page and hides the button when all reports are loaded', async () => {
    mockGet.mockResolvedValue([group('r1', 'Apr')])
    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: /load more/i }))

    await waitFor(() => expect(screen.getAllByTestId('month-section')).toHaveLength(3))
    expect(mockGet).toHaveBeenCalledWith('c1', ['r1'])
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })
})
