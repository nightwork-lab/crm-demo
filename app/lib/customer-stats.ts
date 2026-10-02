import type { HappOrder } from './happ-order'
import type { Customer } from './data'
import type { CustomerLink } from './customer-link'
import {
  isBookableOrder,
  getCustomerLifetimeStats,
  type ComputedStats,
} from './order-metrics'

// ComputedStats は order-metrics.ts が正典。後方互換のため再エクスポート。
export type { ComputedStats }

// ---------- ステータス判定 ----------

/** "YYYY/MM/DD HH:mm" → "YYYY-MM-DD" */
function toDateStr(startTime: string): string {
  return startTime.slice(0, 10).replace(/\//g, '-')
}

/**
 * 顧客別集計対象か判定する（order-metrics.ts の isBookableOrder の別名）。
 * 既存コードとの互換のため残す。
 */
export function isCompletedOrder(order: HappOrder, _today?: string): boolean {
  return isBookableOrder(order)
}

/**
 * 次回予約として扱えるかどうか判定する。
 * キャンセル・仮予約を除いた本日以降のオーダーを対象とする。
 */
export function isFutureReservation(order: HappOrder, today?: string): boolean {
  const t = today ?? new Date().toISOString().slice(0, 10)
  if (!isBookableOrder(order)) return false
  return toDateStr(order.startTime) >= t
}

// ---------- 個別顧客の集計 ----------

/**
 * 紐付き済みオーダー群から顧客の集計値を計算する。
 * customer-detail.ts など、リンク解決済みオーダーを直接渡す場面で使う。
 */
export function computeCustomerStats(
  orders: HappOrder[],
  today?: string,
): ComputedStats {
  const t = today ?? new Date().toISOString().slice(0, 10)

  const completed = orders.filter(isBookableOrder)
  const futures   = orders.filter(o => isFutureReservation(o, t))

  let lastVisitDate: string | null = null
  if (completed.length > 0) {
    const latest = completed.reduce((a, b) => (a.startTime > b.startTime ? a : b))
    lastVisitDate = toDateStr(latest.startTime)
  }

  let nextReservation: string | null = null
  if (futures.length > 0) {
    const earliest = futures.reduce((a, b) => (a.startTime < b.startTime ? a : b))
    nextReservation = toDateStr(earliest.startTime)
  }

  return {
    visitCount:      completed.length,
    completedAmount: completed.reduce((sum, o) => sum + o.totalAmount, 0),
    completedFee:    completed.reduce((sum, o) => sum + o.therapistFee, 0),
    lastVisitDate,
    nextReservation,
    totalOrderCount: orders.length,
  }
}

// ---------- 全顧客の一括集計 ----------

/**
 * order-metrics.ts の getCustomerLifetimeStats に委譲。後方互換のため残す。
 */
export function computeAllCustomersStats(
  allOrders: HappOrder[],
  links: CustomerLink[],
  customers: Customer[],
  today?: string,
): Map<string, ComputedStats> {
  return getCustomerLifetimeStats(allOrders, links, customers, today)
}

// ---------- ダッシュボード用グローバル集計 ----------

export type GlobalHappStats = {
  totalCompletedAmount: number
  totalVisitCount:      number
  linkedCustomerCount:  number
}

export function computeGlobalHappStats(
  allOrders: HappOrder[],
  links: CustomerLink[],
  customers: Customer[],
  today?: string,
): GlobalHappStats {
  const statsMap = computeAllCustomersStats(allOrders, links, customers, today)
  let totalCompletedAmount = 0
  let totalVisitCount = 0
  for (const s of statsMap.values()) {
    totalCompletedAmount += s.completedAmount
    totalVisitCount      += s.visitCount
  }
  return { totalCompletedAmount, totalVisitCount, linkedCustomerCount: statsMap.size }
}
