import * as XLSX from 'xlsx'
import { formatDateForExcel } from '@/lib/utils/date'

type ExportRow = {
  order_id: string
  product_name: string | null
  ordered_at: string
  status_name: string
  commission: number
  commission_return: number
}

export function buildExcelRows(orders: ExportRow[]): unknown[][] {
  const header = ['Order ID', 'Product Name', 'Date', 'Status', 'Commission (₫)', 'Commission Return (₫)']
  const rows = orders.map((o) => [
    o.order_id,
    o.product_name ?? '',
    formatDateForExcel(o.ordered_at),
    o.status_name,
    o.commission,
    o.commission_return,
  ])
  return [header, ...rows]
}

export function exportToExcel(orders: ExportRow[], filename: string): void {
  const rows = buildExcelRows(orders)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = rows[0].map((_, i) => ({
    wch: Math.max(...rows.map((r) => String(r[i] ?? '').length)) + 2,
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Commission Report')
  XLSX.writeFile(wb, filename)
}
