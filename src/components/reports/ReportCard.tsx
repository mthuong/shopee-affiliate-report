'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { RenameReportModal } from './RenameReportModal'
import { deleteReport } from '@/actions/reports'
import { useToast } from '@/components/ui/Toast'
import { formatVND } from '@/lib/utils/currency'
import type { ReportWithStats } from '@/lib/supabase/types'

export function ReportCard({ report }: { report: ReportWithStats }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [showRename, setShowRename] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteReport(report.id)
      showToast('Report deleted')
    } catch {
      showToast('Failed to delete report', 'error')
    } finally {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  return (
    <>
      <div
        className="group bg-gray-900 border border-gray-800 hover:border-orange-500 rounded-xl p-5 flex items-center justify-between cursor-pointer transition-colors"
        onClick={() => router.push(`/reports/${report.id}`)}
      >
        <div>
          <h3 className="text-white font-semibold text-lg">{report.name}</h3>
          <p className="text-gray-400 text-sm mt-1">{report.order_count} orders</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-green-400 font-semibold text-lg">{formatVND(report.total_commission)}</span>
          <div className="hidden group-hover:flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); setShowRename(true) }} className="px-3 py-1.5 text-sm border border-orange-500 text-orange-400 rounded-lg hover:bg-orange-500/10">
              ✏️ Rename
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowDelete(true) }} className="px-3 py-1.5 text-sm border border-red-500 text-red-400 rounded-lg hover:bg-red-500/10">
              🗑 Delete
            </button>
          </div>
        </div>
      </div>
      <RenameReportModal report={report} open={showRename} onClose={() => setShowRename(false)} />
      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Report?"
        message={<>Deleting <strong className="text-white">{report.name}</strong> will permanently remove all <strong className="text-white">{report.order_count}</strong> orders. This cannot be undone.</>}
        confirmLabel="Yes, Delete Report"
      />
    </>
  )
}
