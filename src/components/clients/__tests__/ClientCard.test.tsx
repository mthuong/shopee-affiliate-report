import { render, screen } from '@testing-library/react'
import { ClientCard } from '../ClientCard'
import type { ClientWithReports } from '@/lib/supabase/types'

function makeReport(id: string, name: string, created_at: string) {
  return { report_id: id, report_name: name, created_at, commission: 1000, return: 500 }
}

function client(reports: ClientWithReports['reports']): ClientWithReports {
  return { id: 'c1', name: 'Mie Closet', created_at: '2026-01-01T00:00:00Z', reports }
}

describe('ClientCard', () => {
  it('renders up to 3 report rows and a "+N more reports" line when there are more', () => {
    const reports = [
      makeReport('r4', 'Jun 2026', '2026-06-01T00:00:00Z'),
      makeReport('r3', 'May 2026', '2026-05-01T00:00:00Z'),
      makeReport('r2', 'Apr 2026', '2026-04-01T00:00:00Z'),
      makeReport('r1', 'Mar 2026', '2026-03-01T00:00:00Z'),
    ]
    render(<ClientCard client={client(reports)} />)
    expect(screen.getByText('Jun 2026')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('Apr 2026')).toBeInTheDocument()
    expect(screen.queryByText('Mar 2026')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more reports')).toBeInTheDocument()
  })

  it('renders all rows and no "+N more" line when there are 3 or fewer reports', () => {
    const reports = [makeReport('r1', 'Mar 2026', '2026-03-01T00:00:00Z')]
    render(<ClientCard client={client(reports)} />)
    expect(screen.getByText('Mar 2026')).toBeInTheDocument()
    expect(screen.queryByText(/more reports/)).not.toBeInTheDocument()
  })

  it('shows "No orders yet" when the client has no reports', () => {
    render(<ClientCard client={client([])} />)
    expect(screen.getByText('No orders yet')).toBeInTheDocument()
  })
})
