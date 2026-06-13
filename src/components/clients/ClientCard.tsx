import Link from 'next/link'
import { formatVND } from '@/lib/utils/currency'
import type { ClientWithReports } from '@/lib/supabase/types'

const MAX_ROWS = 3

export function ClientCard({ client }: { client: ClientWithReports }) {
  const visible = client.reports.slice(0, MAX_ROWS)
  const extra = client.reports.length - visible.length

  return (
    <Link
      href={`/clients/${client.id}`}
      className="block bg-raised border border-line hover:border-accent rounded-card p-5 cursor-pointer transition-colors"
    >
      <h3 className="text-ink font-semibold text-lg mb-3">{client.name}</h3>

      {client.reports.length === 0 ? (
        <p className="text-muted text-sm">No orders yet</p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((r) => (
            <div key={r.report_id} className="flex items-center justify-between text-sm">
              <span className="text-muted truncate pr-3">{r.report_name}</span>
              <span className="flex gap-6 text-right whitespace-nowrap">
                <span className="text-success font-medium">{formatVND(r.commission)}</span>
                <span className="text-accent font-medium">{formatVND(r.return)}</span>
              </span>
            </div>
          ))}
          {extra > 0 && (
            <p className="text-muted text-xs pt-1">+{extra} more reports</p>
          )}
        </div>
      )}
    </Link>
  )
}
