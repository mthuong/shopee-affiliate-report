'use client'

type Props = {
  count: number
  clientName: string
  submitting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function SelectActionBar({ count, clientName, submitting, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-page/90 backdrop-blur border-t border-line px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted">
          Assign <span className="text-ink font-semibold">{count}</span> order{count === 1 ? '' : 's'} to <span className="text-accent font-semibold">{clientName}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-control border border-line-strong text-muted hover:bg-sunken disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || count === 0}
            className="px-4 py-2 rounded-control bg-accent hover:bg-accent-hover text-on-accent font-medium disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
