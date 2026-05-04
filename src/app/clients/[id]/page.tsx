import { notFound } from 'next/navigation'
import { getClient, getClients } from '@/actions/clients'
import { getOrdersByClient, getOrderStatuses } from '@/actions/orders'
import { getReportClient } from '@/actions/report-clients'
import { getReport } from '@/actions/reports'
import { calcTotalReturn } from '@/lib/utils/commission'
import { ClientDetailClient } from './ClientDetailClient'
import type { Report, OrderWithStatus } from '@/lib/supabase/types'

type OrderWithReport = OrderWithStatus & {
  reports: { id: string; name: string; created_at: string } | null
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [client, ordersRaw, statuses, allClientsData] = await Promise.all([
    getClient(id),
    getOrdersByClient(id),
    getOrderStatuses(),
    getClients(),
  ])

  if (!client) notFound()

  const orders = ordersRaw as OrderWithReport[]

  // Group orders by report
  const reportIdSet = [...new Set(
    orders.map((o) => o.reports?.id).filter(Boolean) as string[]
  )]

  const reportGroupsRaw = await Promise.all(
    reportIdSet.map(async (reportId) => {
      const [report, rc] = await Promise.all([
        getReport(reportId),
        getReportClient(reportId, id),
      ])
      if (!report) return null
      return {
        report,
        orders: orders.filter((o) => o.reports?.id === reportId),
        commissionPercent: rc?.commission_percent ?? 50,
      }
    })
  )

  const reportGroups = (reportGroupsRaw.filter(Boolean) as { report: Report; orders: typeof orders; commissionPercent: number }[])
    .sort((a, b) => new Date(b.report.created_at).getTime() - new Date(a.report.created_at).getTime())

  const totalCommission = orders
    .filter((o) => o.order_statuses.name === 'Đã hoàn thành')
    .reduce((sum, o) => sum + o.commission, 0)
  const totalReturn = reportGroups.reduce((sum, g) => sum + calcTotalReturn(g.orders.filter((o) => o.order_statuses.name === 'Đã hoàn thành'), g.commissionPercent), 0)
  const allClients = allClientsData.map(({ id, name, created_at }) => ({ id, name, created_at }))

  return (
    <div>
      <a href="/clients" className="text-gray-500 hover:text-gray-300 text-sm mb-6 inline-block">← Clients</a>
      <ClientDetailClient client={client} reportGroups={reportGroups} statuses={statuses} allClients={allClients} totalCommission={totalCommission} totalReturn={totalReturn} />
    </div>
  )
}
