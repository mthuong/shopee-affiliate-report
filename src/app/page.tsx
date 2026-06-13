import { getReports } from '@/actions/reports'
import { ReportCard } from '@/components/reports/ReportCard'
import { CreateReportButton } from '@/components/reports/CreateReportButton'
import { formatVND } from '@/lib/utils/currency'

export default async function ReportsPage() {
  const reports = await getReports()
  const allTimeTotal = reports.reduce((sum, r) => sum + r.total_commission, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <CreateReportButton />
      </div>
      {reports.length === 0 ? (
        <p className="text-muted text-center py-12">No reports yet. Create your first monthly report.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
      {reports.length > 0 && (
        <div className="mt-6 pt-4 border-t border-line flex justify-between text-sm text-muted">
          <span>{reports.length} reports total</span>
          <span className="text-success">All-time: {formatVND(allTimeTotal)}</span>
        </div>
      )}
    </div>
  )
}
