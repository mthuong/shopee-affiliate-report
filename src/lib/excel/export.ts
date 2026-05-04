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

const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/

export function sanitizeCell(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value
}

export function buildExcelRows(orders: ExportRow[]): unknown[][] {
  const header = ['Order ID', 'Product Name', 'Date', 'Status', 'Commission (₫)', 'Commission Return (₫)']
  const rows = orders.map((o) => [
    sanitizeCell(o.order_id),
    sanitizeCell(o.product_name ?? ''),
    formatDateForExcel(o.ordered_at),
    sanitizeCell(o.status_name),
    o.commission,
    o.commission_return,
  ])
  return [header, ...rows]
}

export function exportToExcel(orders: ExportRow[], filename: string): void {
  const rows = buildExcelRows(orders)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const colCount = rows[0].length
  const widths = new Array(colCount).fill(0)
  for (const r of rows) {
    for (let i = 0; i < colCount; i++) {
      const len = String(r[i] ?? '').length
      if (len > widths[i]) widths[i] = len
    }
  }
  ws['!cols'] = widths.map((w) => ({ wch: w + 2 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Commission Report')
  XLSX.writeFile(wb, filename)
}
