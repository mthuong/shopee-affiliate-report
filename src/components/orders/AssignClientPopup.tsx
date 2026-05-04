'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Client } from '@/lib/supabase/types'

type Props = {
  open: boolean
  clients: Client[]
  onConfirm: (client: Client) => void
  onCancel: () => void
}

export function AssignClientPopup({ open, clients, onConfirm, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<string>('')

  function handleConfirm() {
    const client = clients.find((c) => c.id === selectedId)
    if (!client) return
    onConfirm(client)
    setSelectedId('')
  }

  function handleCancel() {
    setSelectedId('')
    onCancel()
  }

  return (
    <Modal open={open} onClose={handleCancel} title="Assign Client">
      <div className="space-y-3">
        <div>
          <label htmlFor="assign-client-select" className="block text-xs text-gray-400 mb-1">Client</label>
          <select
            id="assign-client-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="input"
          >
            <option value="">— Choose a client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={handleCancel} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">Cancel</button>
        <button
          onClick={handleConfirm}
          disabled={!selectedId}
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </Modal>
  )
}
