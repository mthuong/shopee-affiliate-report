import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReport } from '@/actions/reports'
import { getOrdersByReport, getOrderStatuses } from '@/actions/orders'
import { getClientsBasic } from '@/actions/clients'
import { ReportDetailClient } from './ReportDetailClient'
import { RenameReportButton } from '@/components/reports/RenameReportButton'

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [report, orders, statuses, clients] = await Promise.all([
    getReport(id),
    getOrdersByReport(id),
    getOrderStatuses(),
    getClientsBasic(),
  ])

  if (!report) notFound()

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-muted hover:text-ink text-sm">← Reports</Link>
        <span className="text-muted">/</span>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{report.name}</h1>
          <RenameReportButton report={report} />
        </div>
      </div>
      <ReportDetailClient reportId={report.id} initialOrders={orders} statuses={statuses} clients={clients} />
    </div>
  )
}
