'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { createClientRecord } from '@/actions/clients'
import { useToast } from '@/components/ui/Toast'

export function CreateClientButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const client = await createClientRecord(name)
      showToast('Client created')
      setOpen(false)
      setName('')
      router.push(`/clients/${client.id}`)
    } catch {
      showToast('Failed to create client', 'error')
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent rounded-control font-medium text-sm">
        + New Client
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="👤 New Client">
        <label className="block text-sm text-muted mb-1">Client Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder="Nguyễn Văn A" className="input mb-4" autoFocus />
        <div className="flex justify-end gap-3">
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-control border border-line-strong text-muted hover:bg-sunken">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()} className="px-4 py-2 rounded-control bg-accent hover:bg-accent-hover text-on-accent font-medium disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </Modal>
    </>
  )
}
