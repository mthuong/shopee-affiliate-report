'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { renameReport } from '@/actions/reports'
import { useToast } from '@/components/ui/Toast'
import type { Report } from '@/lib/supabase/types'

export function RenameReportModal({ report, open, onClose }: { report: Report; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(report.name)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await renameReport(report.id, name)
      showToast('Report renamed')
      onClose()
    } catch {
      showToast('Failed to rename', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="✏️ Rename Report">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        className="input mb-4"
        autoFocus
      />
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
