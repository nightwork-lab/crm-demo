/**
 * 集計・判定ロジックの唯一の定義元。
 * 全ページ・全機能はここの関数を使い、独自の集計ロジックを持たない。
 *
 * 集計基準:
 *   月全体実績  … キャンセルのみ除外。仮予約・linked/candidate 全て含む。
 *   顧客別実績  … customer-links.json 紐付き済み顧客のみ。キャンセル+仮予約を除外。
 */

import type { HappOrder } from './happ-order'
import type { CustomerLink } from './customer-link'
import type { Customer } from './data'
import { resolveOrderCustomer } from './customer-link'

// ── Types ────────────────────────────────────────────────────────────

export type ComputedStats = {
  visitCount:      number
  completedAmount: number
  completedFee:    number
  lastVisitDate:   string | null
  nextReservation: string | null
  totalOrderCount: number
}

export type MonthActual = {
  visitCount: number
  amount:     number
}

export type MonthGrandTotal = {
  totalAmount:    number
  totalVisits:    number
  linkedAmount:   number
  linkedVisits:   number
  unlinkedAmount: number
  unlinkedVisits: number
}

// ── Predicates ───────────────────────────────────────────────────────

export function isCanceledOrder(order: HappOrder): boolean {
  // キャンセルは表示ステータス（status）と内部ステータス（internalStatus）の
  // どちらかに記録される（happ 側の運用による）ため、両方を判定する
  return order.status === 'キャンセル' || order.internalStatus === 'キャンセル'
}

/** 顧客別実績の集計対象。キャンセル・仮予約を除外する。 */
export function isBookableOrder(order: HappOrder): boolean {
  return !isCanceledOrder(order) && order.internalStatus !== '仮予約'
}

/** 指定月（"YYYY-MM"）のオーダーか判定する。JSON（/区切り）・Supabase（-区切り）両対応。 */
export function isMonthOrder(order: HappOrder, monthKey: string): boolean {
  return toMonthKey(order.startTime) === monthKey
}

// ── Private helpers ───────────────────────────────────────────────────

function toDateStr(startTime: string): string {
  return startTime.slice(0, 10).replace(/\//g, '-')
}

/** startTime を "YYYY-MM" 形式に正規化する（/ と - 両方に対応）。 */
function toMonthKey(startTime: string): string {
  return startTime.slice(0, 7).replace(/\//g, '-')
}

function isFutureBookable(order: HappOrder, today: string): boolean {
  return isBookableOrder(order) && toDateStr(order.startTime) >= today
}

function computeStatsForOrders(orders: HappOrder[], today: string): ComputedStats {
  const completed = orders.filter(isBookableOrder)
  const futures   = orders.filter(o => isFutureBookable(o, today))

  let lastVisitDate: string | null = null
  if (completed.length > 0) {
    const latest = completed.reduce((a, b) => a.startTime > b.startTime ? a : b)
    lastVisitDate = toDateStr(latest.startTime)
  }

  let nextReservation: string | null = null
  if (futures.length > 0) {
    const earliest = futures.reduce((a, b) => a.startTime < b.startTime ? a : b)
    nextReservation = toDateStr(earliest.startTime)
  }

  return {
    visitCount:      completed.length,
    completedAmount: completed.reduce((s, o) => s + o.totalAmount, 0),
    completedFee:    completed.reduce((s, o) => s + o.therapistFee, 0),
    lastVisitDate,
    nextReservation,
    totalOrderCount: orders.length,
  }
}

// ── Aggregations ─────────────────────────────────────────────────────

/**
 * 月全体実績。/orders 月ヘッダーと同一基準。
 * キャンセルのみ除外。仮予約・linked/candidate 両方含む。
 */
export function getMonthGrandTotal(
  allOrders: HappOrder[],
  links:     CustomerLink[],
  customers: Customer[],
  monthKey:  string,
): MonthGrandTotal {
  let totalAmount = 0, totalVisits = 0
  let linkedAmount = 0, linkedVisits = 0

  for (const order of allOrders) {
    if (!isMonthOrder(order, monthKey)) continue
    if (isCanceledOrder(order)) continue
    totalAmount += order.totalAmount
    totalVisits++
    if (resolveOrderCustomer(order, links, customers).type === 'linked') {
      linkedAmount += order.totalAmount
      linkedVisits++
    }
  }

  return {
    totalAmount, totalVisits,
    linkedAmount, linkedVisits,
    unlinkedAmount: totalAmount - linkedAmount,
    unlinkedVisits: totalVisits - linkedVisits,
  }
}

export function getLinkedMonthTotal(
  allOrders: HappOrder[], links: CustomerLink[], customers: Customer[], monthKey: string,
): MonthActual {
  const g = getMonthGrandTotal(allOrders, links, customers, monthKey)
  return { visitCount: g.linkedVisits, amount: g.linkedAmount }
}

export function getUnlinkedMonthTotal(
  allOrders: HappOrder[], links: CustomerLink[], customers: Customer[], monthKey: string,
): MonthActual {
  const g = getMonthGrandTotal(allOrders, links, customers, monthKey)
  return { visitCount: g.unlinkedVisits, amount: g.unlinkedAmount }
}

/**
 * 顧客別月次実績。customer-links 紐付き済み顧客のみ。
 * キャンセル・仮予約を除外する（isBookableOrder 基準）。
 */
export function getCustomerMonthActuals(
  allOrders: HappOrder[], links: CustomerLink[], customers: Customer[], monthKey: string,
): Map<string, MonthActual> {
  const result = new Map<string, MonthActual>()
  for (const order of allOrders) {
    if (!isMonthOrder(order, monthKey)) continue
    if (!isBookableOrder(order)) continue
    const res = resolveOrderCustomer(order, links, customers)
    if (res.type !== 'linked') continue
    const cur = result.get(res.customer.id) ?? { visitCount: 0, amount: 0 }
    cur.visitCount++
    cur.amount += order.totalAmount
    result.set(res.customer.id, cur)
  }
  return result
}

// ── Fee Stats ─────────────────────────────────────────────────────────

export type MonthFeeStats = {
  therapistFee: number  // ギャラ合計
  tenOchi:      number  // 店落ち合計 (totalAmount − therapistFee)
}

/**
 * 月間ギャラ・店落ちの合計。表示用。既存集計ロジックを変更しない。
 * キャンセルのみ除外。getMonthGrandTotal と同一除外条件。
 */
export function getMonthFeeStats(
  allOrders: HappOrder[],
  monthKey:  string,
): MonthFeeStats {
  let therapistFee = 0
  let tenOchi      = 0
  for (const order of allOrders) {
    if (!isMonthOrder(order, monthKey)) continue
    if (isCanceledOrder(order)) continue
    therapistFee += order.therapistFee
    tenOchi      += order.totalAmount - order.therapistFee
  }
  return { therapistFee, tenOchi }
}

/**
 * 顧客別全期間実績。customer-links 紐付き済み顧客のみ。
 * キャンセル・仮予約を除外する（isBookableOrder 基準）。
 */
export function getCustomerLifetimeStats(
  allOrders: HappOrder[],
  links:     CustomerLink[],
  customers: Customer[],
  today?:    string,
): Map<string, ComputedStats> {
  const t = today ?? new Date().toISOString().slice(0, 10)
  const grouped = new Map<string, HappOrder[]>()
  for (const order of allOrders) {
    const res = resolveOrderCustomer(order, links, customers)
    if (res.type !== 'linked') continue
    const arr = grouped.get(res.customer.id) ?? []
    arr.push(order)
    grouped.set(res.customer.id, arr)
  }
  const statsMap = new Map<string, ComputedStats>()
  for (const [id, orders] of grouped) {
    statsMap.set(id, computeStatsForOrders(orders, t))
  }
  return statsMap
}

/**
 * 顧客別最終来店日時（過去〜本日のみ）。キャンセル・仮予約を除外する。
 * 戻り値: customerId → startTime ("YYYY/MM/DD HH:mm")
 * 来店なしの顧客はマップに含まれない。
 */
export function getCustomerLastVisitDates(
  allOrders: HappOrder[],
  links:     CustomerLink[],
  customers: Customer[],
  today?:    string,
): Map<string, string> {
  const t = today ?? new Date().toISOString().slice(0, 10)
  const result = new Map<string, string>()
  for (const order of allOrders) {
    if (!isBookableOrder(order)) continue
    if (order.startTime.slice(0, 10).replace(/\//g, '-') > t) continue
    const res = resolveOrderCustomer(order, links, customers)
    if (res.type !== 'linked') continue
    const prev = result.get(res.customer.id)
    if (!prev || order.startTime > prev) {
      result.set(res.customer.id, order.startTime)
    }
  }
  return result
}

/**
 * オーダー配列から次回予約（本日以降の最も近い予約）を1件返す。
 * 顧客詳細ページなど、対象顧客のオーダーが手元にある場面用。
 */
export function getNextReservationOrder(
  orders: HappOrder[],
  today?: string,
): HappOrder | null {
  const t = today ?? new Date().toISOString().slice(0, 10)
  let next: HappOrder | null = null
  for (const order of orders) {
    if (!isFutureBookable(order, t)) continue
    if (!next || order.startTime < next.startTime) next = order
  }
  return next
}

/**
 * 顧客別 次回予約オーダー（本日以降の最も近い予約）。キャンセル・仮予約を除外する。
 * 予約詳細（コース・金額等）の表示に使う。日付文字列だけで足りる場合は
 * ComputedStats.nextReservation を使うこと。
 * 戻り値: customerId → HappOrder。予約なしの顧客はマップに含まれない。
 */
export function getCustomerNextReservationOrders(
  allOrders: HappOrder[],
  links:     CustomerLink[],
  customers: Customer[],
  today?:    string,
): Map<string, HappOrder> {
  const t = today ?? new Date().toISOString().slice(0, 10)
  const result = new Map<string, HappOrder>()
  for (const order of allOrders) {
    if (!isFutureBookable(order, t)) continue
    const res = resolveOrderCustomer(order, links, customers)
    if (res.type !== 'linked') continue
    const prev = result.get(res.customer.id)
    if (!prev || order.startTime < prev.startTime) {
      result.set(res.customer.id, order)
    }
  }
  return result
}

/**
 * 顧客別 初回来店日時（過去〜本日のみ）。キャンセル・仮予約を除外する。
 * 「初指名」（対象月が初回来店だった顧客）の判定に使う。
 * 戻り値: customerId → startTime ("YYYY/MM/DD HH:mm")
 * 来店なしの顧客はマップに含まれない。
 */
export function getCustomerFirstVisitDates(
  allOrders: HappOrder[],
  links:     CustomerLink[],
  customers: Customer[],
  today?:    string,
): Map<string, string> {
  const t = today ?? new Date().toISOString().slice(0, 10)
  const result = new Map<string, string>()
  for (const order of allOrders) {
    if (!isBookableOrder(order)) continue
    if (order.startTime.slice(0, 10).replace(/\//g, '-') > t) continue
    const res = resolveOrderCustomer(order, links, customers)
    if (res.type !== 'linked') continue
    const prev = result.get(res.customer.id)
    if (!prev || order.startTime < prev) {
      result.set(res.customer.id, order.startTime)
    }
  }
  return result
}
