'use client'

import { useState } from 'react'
import { CreateReportModal } from './CreateReportModal'

export function CreateReportButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent rounded-control font-medium text-sm">
        + New Report
      </button>
      <CreateReportModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
