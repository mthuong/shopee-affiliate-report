'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { buildClientReportBreakdown, DEFAULT_COMMISSION_PERCENT } from '@/lib/utils/commission'
import type { Client, ClientWithReports, ReportBreakdown, ReportGroup, OrderWithStatus } from '@/lib/supabase/types'

const CLIENT_BREAKDOWN_SELECT =
  '*, orders(commission, report_id, status_id, reports(id, name, created_at)), report_clients(commission_percent, report_id)'

export async function getClients(): Promise<ClientWithReports[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_BREAKDOWN_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    reports: buildClientReportBreakdown(c.orders ?? [], c.report_clients ?? []),
  }))
}

// Lightweight per-client summary: ordered report breakdown (drives the detail
// page's totals + pagination) without loading full order detail.
export async function getClientReportSummary(clientId: string): Promise<ReportBreakdown[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_BREAKDOWN_SELECT)
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw error
  if (!data) return []
  return buildClientReportBreakdown(data.orders ?? [], data.report_clients ?? [])
}

// Full order detail for a page of reports. Returns ReportGroups ordered to match
// the requested reportIds.
export async function getClientReportGroups(
  clientId: string,
  reportIds: string[]
): Promise<ReportGroup[]> {
  if (reportIds.length === 0) return []
  const supabase = await createSupabaseClient()

  const [{ data: orders, error: ordersError }, { data: rcs, error: rcError }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, order_statuses(*), reports(id, name, created_at)')
      .eq('client_id', clientId)
      .in('report_id', reportIds)
      .order('ordered_at', { ascending: false }),
    supabase
      .from('report_clients')
      .select('report_id, commission_percent')
      .eq('client_id', clientId)
      .in('report_id', reportIds),
  ])

  if (ordersError) throw ordersError
  if (rcError) throw rcError

  const percentByReport = new Map<string, number>(
    (rcs ?? []).map((r) => [r.report_id, r.commission_percent])
  )

  return reportIds
    .map((id) => {
      const group = (orders ?? []).filter((o) => o.report_id === id)
      const reportObj = group[0]?.reports as { id: string; name: string; created_at: string } | null
      if (!reportObj) return null
      return {
        report: reportObj,
        orders: group as OrderWithStatus[],
        commissionPercent: percentByReport.get(id) ?? DEFAULT_COMMISSION_PERCENT,
      }
    })
    .filter((g): g is ReportGroup => g !== null)
}

// Minimal client list for the order-reassignment dropdown.
export async function getClientsBasic(): Promise<Client[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
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
