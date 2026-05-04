export function formatVND(amount: number): string {
  return `₫${amount.toLocaleString('en-US')}`
}

export function parseVND(value: string): number {
  const cleaned = value.replace(/[₫,\s]/g, '')
  const parsed = parseInt(cleaned, 10)
  return isNaN(parsed) ? 0 : parsed
}
