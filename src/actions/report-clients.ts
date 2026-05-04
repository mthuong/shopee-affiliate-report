'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ReportClient } from '@/lib/supabase/types'

export async function getReportClient(
  reportId: string,
  clientId: string
): Promise<ReportClient | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('report_clients')
    .select('*')
    .eq('report_id', reportId)
    .eq('client_id', clientId)
    .single()

  return data ?? null
}

export async function updateCommissionPercent(
  reportId: string,
  clientId: string,
  percent: number
): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)))
  const supabase = await createClient()
  const { error } = await supabase
    .from('report_clients')
    .update({ commission_percent: clamped })
    .eq('report_id', reportId)
    .eq('client_id', clientId)

  if (error) throw error
  revalidatePath(`/clients/${clientId}`)
}
