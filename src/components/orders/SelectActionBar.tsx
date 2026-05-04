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
    <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-950/90 backdrop-blur border-t border-gray-800 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-200">
          Assign <span className="text-white font-semibold">{count}</span> order{count === 1 ? '' : 's'} to <span className="text-orange-400 font-semibold">{clientName}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || count === 0}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
