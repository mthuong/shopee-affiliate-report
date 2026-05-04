import Link from 'next/link'
import { formatVND } from '@/lib/utils/currency'
import type { ClientWithTotals } from '@/lib/supabase/types'

export function ClientCard({ client }: { client: ClientWithTotals }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="bg-gray-900 border border-gray-800 hover:border-orange-500 rounded-xl p-5 flex items-center justify-between cursor-pointer transition-colors"
    >
      <h3 className="text-white font-semibold text-lg">{client.name}</h3>
      <div className="flex gap-8 text-right">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Total Commission</p>
          <p className="text-green-400 font-semibold">{formatVND(client.total_commission)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Total Return</p>
          <p className="text-orange-400 font-semibold">{formatVND(client.total_return)}</p>
        </div>
      </div>
    </Link>
  )
}
