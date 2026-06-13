export type OrderStatus = {
  id: number
  name: string
}

export type Report = {
  id: string
  name: string
  created_at: string
}

export type Client = {
  id: string
  name: string
  created_at: string
}

export type ReportClient = {
  id: string
  report_id: string
  client_id: string
  commission_percent: number
}

export type Order = {
  id: string
  report_id: string
  order_id: string
  product_name: string | null
  status_id: number
  commission: number
  ordered_at: string
  client_id: string | null
  is_manual: boolean
  created_at: string
}

export type OrderWithStatus = Order & {
  order_statuses: OrderStatus
  clients: Client | null
}

export type ReportWithStats = Report & {
  order_count: number
  total_commission: number
}

export type ParsedOrder = {
  order_id: string
  product_name: string | null
  status_name: string
  commission_vnd: number
  ordered_at: string
}

export type ReportBreakdown = {
  report_id: string
  report_name: string
  created_at: string
  commission: number
  return: number
}

export type ClientWithReports = Client & {
  reports: ReportBreakdown[]
}

export type ReportGroup = {
  report: Report
  orders: OrderWithStatus[]
  commissionPercent: number
}
