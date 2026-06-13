'use client'

import { useState } from 'react'
import { ClientMonthSection } from '@/components/clients/ClientMonthSection'
import { getClientReportGroups } from '@/actions/clients'
import { useToast } from '@/components/ui/Toast'
import { formatVND } from '@/lib/utils/currency'
import type { OrderStatus, Client, ReportBreakdown, ReportGroup } from '@/lib/supabase/types'

const PAGE_SIZE = 2

type Props = {
  client: Client
  clientId: string
  reportList: ReportBreakdown[]
  initialGroups: ReportGroup[]
  statuses: OrderStatus[]
  allClients: Client[]
  totalCommission: number
  totalReturn: number
}

export function ClientDetailClient({
  client,
  clientId,
  reportList,
  initialGroups,
  statuses,
  allClients,
  totalCommission,
  totalReturn,
}: Props) {
  const { showToast } = useToast()
  const [groups, setGroups] = useState<ReportGroup[]>(initialGroups)
  const [loadedUpTo, setLoadedUpTo] = useState(initialGroups.length)
  const [loading, setLoading] = useState(false)

  const hasMore = loadedUpTo < reportList.length

  async function handleLoadMore() {
    const nextIds = reportList.slice(loadedUpTo, loadedUpTo + PAGE_SIZE).map((r) => r.report_id)
    setLoading(true)
    try {
      const next = await getClientReportGroups(clientId, nextIds)
      setGroups((prev) => [...prev, ...next])
      setLoadedUpTo((prev) => prev + nextIds.length) // advance by requested, not received
    } catch {
      showToast('Failed to load more reports', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{client.name}</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-raised border border-line rounded-card p-5 text-center">
          <p className="text-muted text-sm mb-1">Total Commission</p>
          <p className="text-success text-2xl font-bold">{formatVND(totalCommission)}</p>
        </div>
        <div className="bg-raised border border-line rounded-card p-5 text-center">
          <p className="text-muted text-sm mb-1">Total Commission Return</p>
          <p className="text-accent text-2xl font-bold">{formatVND(totalReturn)}</p>
        </div>
      </div>

      {reportList.length === 0 ? (
        <p className="text-muted text-center py-12">No completed orders for this client yet.</p>
      ) : (
        <>
          {groups.map(({ report, orders, commissionPercent }) => (
            <ClientMonthSection
              key={report.id}
              report={report}
              client={client}
              initialOrders={orders}
              initialPercent={commissionPercent}
              statuses={statuses}
              allClients={allClients}
            />
          ))}
          {hasMore && (
            <div className="text-center mt-2">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-4 py-2 text-sm border border-line-strong text-muted rounded-control hover:bg-sunken disabled:opacity-50"
              >
                {loading ? 'Loading…' : `Load more (${reportList.length - loadedUpTo} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
