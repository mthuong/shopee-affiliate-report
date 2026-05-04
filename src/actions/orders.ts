'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Order, OrderWithStatus } from '@/lib/supabase/types'

export async function getOrdersByReport(reportId: string): Promise<OrderWithStatus[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_statuses(*), clients(id, name, created_at)')
    .eq('report_id', reportId)
    .order('ordered_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getOrdersByClient(clientId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_statuses(*), clients(id, name, created_at), reports(id, name, created_at)')
    .eq('client_id', clientId)
    .order('ordered_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getOrderStatuses() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('order_statuses')
    .select('*')
    .order('id')

  if (error) throw error
  return data ?? []
}

export async function createOrder(
  order: Omit<Order, 'id' | 'created_at'>
): Promise<Order> {
  const supabase = await createClient()

  // Ensure report_clients row exists when creating an order with a client assigned
  if (order.client_id) {
    await supabase
      .from('report_clients')
      .upsert(
        { report_id: order.report_id, client_id: order.client_id, commission_percent: 50 },
        { onConflict: 'report_id,client_id', ignoreDuplicates: true }
      )
  }

  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single()

  if (error) throw error
  revalidatePath(`/reports/${order.report_id}`)
  if (order.client_id) revalidatePath(`/clients/${order.client_id}`)
  return data
}

export async function createOrders(
  orders: Omit<Order, 'id' | 'created_at'>[]
): Promise<{ saved: Order[]; skipped: number }> {
  if (orders.length === 0) return { saved: [], skipped: 0 }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .upsert(orders, { onConflict: 'report_id,order_id', ignoreDuplicates: true })
    .select()

  if (error) throw error
  const saved = data ?? []
  revalidatePath(`/reports/${orders[0].report_id}`)
  return { saved, skipped: orders.length - saved.length }
}

export async function updateOrder(
  id: string,
  updates: Partial<Omit<Order, 'id' | 'created_at'>> & { report_id?: string }
): Promise<Order> {
  const supabase = await createClient()

  // Ensure report_clients row exists when assigning a client
  if (updates.client_id && updates.report_id) {
    await supabase
      .from('report_clients')
      .upsert(
        { report_id: updates.report_id, client_id: updates.client_id, commission_percent: 50 },
        { onConflict: 'report_id,client_id', ignoreDuplicates: true }
      )
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  revalidatePath(`/reports/${data.report_id}`)
  if (data.client_id) revalidatePath(`/clients/${data.client_id}`)
  return data
}

export async function deleteOrder(id: string, reportId: string): Promise<void> {
  const supabase = await createClient()

  // Fetch the order first so we can revalidate the client page if assigned
  const { data: order } = await supabase
    .from('orders')
    .select('client_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('orders').delete().eq('id', id)

  if (error) throw error
  revalidatePath(`/reports/${reportId}`)
  if (order?.client_id) revalidatePath(`/clients/${order.client_id}`)
}
