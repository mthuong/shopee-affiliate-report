'use client'

type Props = {
  disabled: boolean
  onClick: () => void
}

export function AssignClientButton({ disabled, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-orange-400 border border-orange-500/40 px-3 py-1.5 rounded-lg hover:bg-orange-500/10 disabled:opacity-50"
      title={disabled ? 'No unassigned orders to assign' : undefined}
    >
      Assign Client
    </button>
  )
}
