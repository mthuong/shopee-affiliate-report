'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { createReport } from '@/actions/reports'
import { useToast } from '@/components/ui/Toast'
import { defaultReportName } from '@/lib/utils/date'

export function CreateReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(defaultReportName())
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  async function handleCreate() {
    setSaving(true)
    try {
      const report = await createReport(name)
      showToast('Report created')
      onClose()
      router.push(`/reports/${report.id}`)
    } catch {
      showToast('Failed to create report', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="📋 New Report">
      <label className="block text-sm text-gray-400 mb-1">Report Name</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} className="input mb-4" autoFocus />
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">Cancel</button>
        <button onClick={handleCreate} disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Report'}
        </button>
      </div>
    </Modal>
  )
}
