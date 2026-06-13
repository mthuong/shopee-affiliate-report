import * as XLSX from 'xlsx'
import type { ParsedOrder } from '@/lib/supabase/types'

const STATUS_MAP: Record<string, string> = {
  Completed: 'Đã hoàn thành',
  Cancelled: 'Đã hủy',
}

const COL = {
  orderId: 'Order id',
  status: 'Order Status',
  time: 'Order Time',
  itemName: 'Item Name',
  commission: 'Total Order Commission(₫)',
} as const

const REQUIRED_HEADERS = Object.values(COL)

type Row = Record<string, unknown>

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/**
 * Convert an XLSX cell value for the Order Time column to an ISO-like string
 * "2026-05-20T08:57:20" without timezone conversion.
 *
 * With cellDates:true, XLSX parses "2026-05-20 08:57:20" into a JS Date object
 * whose local-time components match the original string regardless of the host
 * timezone. We format it using local-time getters (getHours etc.) to preserve
 * the original wall-clock time.
 */
function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
      `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
    )
  }
  // Fallback: plain string — replace the single space between date and time with T
  // Using a pattern anchored to a digit boundary ensures only the date/time
  // separator is replaced (not any spaces that may appear elsewhere in the string).
  return String(value ?? '').trim().replace(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2')
}

export function parseAffiliateCsv(input: string | ArrayBuffer): ParsedOrder[] {
  const wb =
    typeof input === 'string'
      ? // codepage is irrelevant here — the JS string is already decoded
        XLSX.read(input, { type: 'string', cellDates: true })
      : XLSX.read(new Uint8Array(input), { type: 'array', cellDates: true, codepage: 65001 })

  const ws = wb.Sheets[wb.SheetNames[0]]
  // raw: true preserves numeric commission values and Date objects from cellDates
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: '', raw: true })

  if (rows.length === 0) return []

  const headers = Object.keys(rows[0])
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    throw new Error("This doesn't look like a Shopee affiliate commission CSV.")
  }

  const groups = new Map<string, Row[]>()
  const orderedIds: string[] = []
  for (const row of rows) {
    const id = String(row[COL.orderId] ?? '').trim()
    if (!id) continue
    if (!groups.has(id)) {
      groups.set(id, [])
      orderedIds.push(id)
    }
    groups.get(id)!.push(row)
  }

  const result: ParsedOrder[] = orderedIds.map((id) => {
    const items = groups.get(id)!
    const commission_vnd = Math.round(
      items.reduce((sum, r) => sum + toNumber(r[COL.commission]), 0),
    )
    const names = items
      .map((r) => String(r[COL.itemName] ?? '').trim())
      .filter((n) => n.length > 0)
    const first = items[0]
    const rawStatus = String(first[COL.status] ?? '').trim()
    return {
      order_id: id,
      product_name: names.length > 0 ? names.join('; ') : null,
      status_name: STATUS_MAP[rawStatus] ?? rawStatus,
      commission_vnd,
      ordered_at: normalizeDate(first[COL.time]),
    }
  })

  result.sort((a, b) =>
    a.ordered_at < b.ordered_at ? 1 : a.ordered_at > b.ordered_at ? -1 : 0,
  )
  return result
}
