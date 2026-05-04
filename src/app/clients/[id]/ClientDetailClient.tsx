'use client'

import { ClientMonthSection } from '@/components/clients/ClientMonthSection'
import { formatVND } from '@/lib/utils/currency'
import type { OrderWithStatus, OrderStatus, Client, Report } from '@/lib/supabase/types'

type ReportGroup = { report: Report; orders: OrderWithStatus[]; commissionPercent: number }

type Props = {
  client: Client
  reportGroups: ReportGroup[]
  statuses: OrderStatus[]
  allClients: Client[]
  totalCommission: number
  totalReturn: number
}

export function ClientDetailClient({ client, reportGroups, statuses, allClients, totalCommission, totalReturn }: Props) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{client.name}</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-1">Total Commission</p>
          <p className="text-green-400 text-2xl font-bold">{formatVND(totalCommission)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-1">Total Commission Return</p>
          <p className="text-orange-400 text-2xl font-bold">{formatVND(totalReturn)}</p>
        </div>
      </div>
      {reportGroups.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No orders assigned to this client yet.</p>
      ) : (
        reportGroups.map(({ report, orders, commissionPercent }) => (
          <ClientMonthSection key={report.id} report={report} client={client} initialOrders={orders} initialPercent={commissionPercent} statuses={statuses} allClients={allClients} />
        ))
      )}
    </div>
  )
}
