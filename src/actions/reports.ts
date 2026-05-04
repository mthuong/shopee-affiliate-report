'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { defaultReportName } from '@/lib/utils/date'
import type { Report, ReportWithStats } from '@/lib/supabase/types'

export async function getReports(): Promise<ReportWithStats[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reports')
    .select('*, orders(commission)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r) => ({
    ...r,
    order_count: r.orders?.length ?? 0,
    total_commission: (r.orders ?? []).reduce(
      (sum: number, o: { commission: number }) => sum + o.commission,
      0
    ),
  }))
}

export async function getReport(id: string): Promise<Report | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createReport(name?: string): Promise<Report> {
  const supabase = await createClient()
  const reportName = name?.trim() || defaultReportName()
  const { data, error } = await supabase
    .from('reports')
    .insert({ name: reportName })
    .select()
    .single()

  if (error) throw error
  revalidatePath('/')
  return data
}

export async function renameReport(id: string, name: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('reports')
    .update({ name: name.trim() })
    .eq('id', id)

  if (error) throw error
  revalidatePath('/')
  revalidatePath(`/reports/${id}`)
}

export async function deleteReport(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('reports').delete().eq('id', id)

  if (error) throw error
  revalidatePath('/')
}
