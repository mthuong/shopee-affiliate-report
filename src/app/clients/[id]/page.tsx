import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClient, getClientReportSummary, getClientReportGroups, getClientsBasic } from '@/actions/clients'
import { getOrderStatuses } from '@/actions/orders'
import { ClientDetailClient } from './ClientDetailClient'

const INITIAL_REPORTS = 2

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [client, reportList, statuses, allClients] = await Promise.all([
    getClient(id),
    getClientReportSummary(id),
    getOrderStatuses(),
    getClientsBasic(),
  ])

  if (!client) notFound()

  const totalCommission = reportList.reduce((sum, r) => sum + r.commission, 0)
  const totalReturn = reportList.reduce((sum, r) => sum + r.return, 0)

  const initialGroups = await getClientReportGroups(
    id,
    reportList.slice(0, INITIAL_REPORTS).map((r) => r.report_id)
  )

  return (
    <div>
      <Link href="/clients" className="text-muted hover:text-ink text-sm mb-6 inline-block">← Clients</Link>
      <ClientDetailClient
        client={client}
        clientId={id}
        reportList={reportList}
        initialGroups={initialGroups}
        statuses={statuses}
        allClients={allClients}
        totalCommission={totalCommission}
        totalReturn={totalReturn}
      />
    </div>
  )
}
