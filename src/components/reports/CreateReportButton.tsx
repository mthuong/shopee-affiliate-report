'use client'

import { useState } from 'react'
import { CreateReportModal } from './CreateReportModal'

export function CreateReportButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-lg font-medium text-sm">
        + New Report
      </button>
      <CreateReportModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
