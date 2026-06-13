'use client'

import { useRef, useState } from 'react'
import { parseAffiliateCsv } from '@/lib/csv/parse-affiliate-csv'
import type { ParsedOrder } from '@/lib/supabase/types'

type Props = {
  onParsed: (orders: ParsedOrder[]) => void
}

export function CsvUploader({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const orders = parseAffiliateCsv(buffer)
      onParsed(orders)
      setMessage(
        orders.length > 0
          ? `Parsed ${orders.length} order${orders.length === 1 ? '' : 's'} from ${file.name}`
          : 'No orders found in this file.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center">
      <input
        ref={inputRef}
        data-testid="csv-input"
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="text-sm text-orange-400 border border-orange-500/40 px-4 py-2 rounded-lg hover:bg-orange-500/10"
      >
        📄 Import from CSV
      </button>
      <p className="text-gray-600 text-xs mt-2">
        Upload the Affiliate Commission Report CSV exported from Shopee.
      </p>
      {message && <p className="text-green-400 text-xs mt-2">{message}</p>}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
