'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { calcReturn, COMPLETED_STATUS_ID, DEFAULT_COMMISSION_PERCENT } from '@/lib/utils/commission'
import type { Client, ClientWithTotals } from '@/lib/supabase/types'

export async function getClients(): Promise<ClientWithTotals[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*, orders(commission, report_id, status_id), report_clients(commission_percent, report_id)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => {
    const completedOrders = (c.orders ?? []).filter(
      (o: { status_id: number }) => o.status_id === COMPLETED_STATUS_ID
    )
    const totalCommission = completedOrders.reduce(
      (sum: number, o: { commission: number }) => sum + o.commission,
      0
    )
    const totalReturn = completedOrders.reduce(
      (sum: number, o: { commission: number; report_id: string }) => {
        const rc = (c.report_clients ?? []).find(
          (r: { report_id: string }) => r.report_id === o.report_id
        )
        return sum + calcReturn(o.commission, rc?.commission_percent ?? DEFAULT_COMMISSION_PERCENT)
      },
      0
    )
    return { ...c, total_commission: totalCommission, total_return: totalReturn }
  })
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createClientRecord(name: string): Promise<Client> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) throw error
  revalidatePath('/clients')
  return data
}

export async function deleteClientRecord(id: string): Promise<void> {
  const supabase = await createSupabaseClient()
  const { error } = await supabase.from('clients').delete().eq('id', id)

  if (error) throw error
  revalidatePath('/clients')
}
