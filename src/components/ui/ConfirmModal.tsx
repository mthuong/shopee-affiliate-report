'use client'

import { Modal } from './Modal'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: React.ReactNode
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-muted mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-control border border-line-strong text-muted hover:bg-sunken">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 rounded-control bg-danger hover:opacity-90 text-on-accent font-medium disabled:opacity-50"
        >
          {loading ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
