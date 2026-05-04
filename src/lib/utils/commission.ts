export const COMPLETED_STATUS_ID = 1
export const DEFAULT_COMMISSION_PERCENT = 50

export function calcReturn(commission: number, percent: number): number {
  return Math.floor((commission * percent) / 100)
}

export function calcSubtotal(orders: { commission: number }[]): number {
  return orders.reduce((sum, o) => sum + o.commission, 0)
}

export function calcTotalReturn(
  orders: { commission: number }[],
  percent: number
): number {
  return orders.reduce((sum, o) => sum + calcReturn(o.commission, percent), 0)
}
