'use client'

import { useState } from 'react'
import { RenameReportModal } from './RenameReportModal'
import type { Report } from '@/lib/supabase/types'

export function RenameReportButton({ report }: { report: Report }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-ink border border-line-strong rounded px-2 py-0.5">✏️</button>
      <RenameReportModal report={report} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
