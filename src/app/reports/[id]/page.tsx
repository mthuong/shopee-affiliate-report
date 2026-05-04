import { notFound } from 'next/navigation'
import { getReport } from '@/actions/reports'
import { getOrdersByReport, getOrderStatuses } from '@/actions/orders'
import { getClients } from '@/actions/clients'
import { ReportDetailClient } from './ReportDetailClient'
import { RenameReportButton } from '@/components/reports/RenameReportButton'

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const [report, orders, statuses, clientsData] = await Promise.all([
    getReport(params.id),
    getOrdersByReport(params.id),
    getOrderStatuses(),
    getClients(),
  ])

  if (!report) notFound()

  const clients = clientsData.map(({ id, name, created_at }) => ({ id, name, created_at }))

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Reports</a>
        <span className="text-gray-700">/</span>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{report.name}</h1>
          <RenameReportButton report={report} />
        </div>
      </div>
      <ReportDetailClient reportId={report.id} initialOrders={orders} statuses={statuses} clients={clients} />
    </div>
  )
}
