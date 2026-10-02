import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { dataDir, dataPath } from './data-dir'
import type { HappOrder } from './happ-order'
import type { CustomerLink } from './customer-link'
import type { Customer } from './data'
import { isFutureReservation } from './customer-stats'
import {
  isBookableOrder,
  getMonthGrandTotal as _getMonthGrandTotal,
  getCustomerMonthActuals,
  type MonthActual,
  type MonthGrandTotal,
} from './order-metrics'
export { prevMonthKey, nextMonthKey, formatMonthLabel } from './prediction-utils'

// MonthActual / MonthGrandTotal は order-metrics.ts が正典。後方互換のため再エクスポート。
export type { MonthActual, MonthGrandTotal }

// ---------- 型定義 ----------

/** 当月のフォロー状況。未設定（フィールドなし）= 未対応。 */
export type FollowUpStatus = 'contacted' | 'needs_contact'

export type CustomerPrediction = {
  customerId:       string
  targetMonth:      string   // "2026-05"
  predictedVisits:  number
  predictedRevenue: number
  memo:             string
  followUpStatus?:  FollowUpStatus  // 'contacted'=今月対応済み / 'needs_contact'=要連絡
  updatedAt:        string   // ISO8601
}

type PredictionsFile = {
  predictions: CustomerPrediction[]
}

export type CustomerPredictionContext = {
  lastMonth:        MonthActual
  avg3months:       MonthActual
  lastVisitDate:    string | null
  nextReservation:  string | null
  totalVisitCount:  number
  totalAmount:      number
  avgVisitInterval: number | null
}

// ---------- ファイル I/O ----------

const FILE = dataPath('customer-predictions.json')

export function loadPredictions(): CustomerPrediction[] {
  try {
    const raw  = readFileSync(FILE, 'utf-8')
    const file = JSON.parse(raw) as PredictionsFile
    return file.predictions ?? []
  } catch {
    return []
  }
}

function savePredictions(predictions: CustomerPrediction[]) {
  mkdirSync(dataDir(), { recursive: true })
  const tmp = FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify({ predictions }, null, 2), 'utf-8')
  renameSync(tmp, FILE)
}

export function getPrediction(customerId: string, targetMonth: string): CustomerPrediction | null {
  return loadPredictions().find(
    (p) => p.customerId === customerId && p.targetMonth === targetMonth,
  ) ?? null
}

export function upsertPrediction(
  pred: Omit<CustomerPrediction, 'updatedAt'>,
): CustomerPrediction {
  const all = loadPredictions()
  const idx = all.findIndex(
    (p) => p.customerId === pred.customerId && p.targetMonth === pred.targetMonth,
  )
  // 予測値の保存ではフォロー状況を引き継ぐ（明示指定があればそれを優先）
  const prevStatus = idx >= 0 ? all[idx].followUpStatus : undefined
  const updated: CustomerPrediction = {
    ...pred,
    followUpStatus: pred.followUpStatus ?? prevStatus,
    updatedAt: new Date().toISOString(),
  }
  if (idx >= 0) { all[idx] = updated } else { all.push(updated) }
  savePredictions(all)
  return updated
}

/**
 * 当月のフォロー状況だけを更新する。予測値・メモは保持。
 * 同じ状態を再指定した場合は解除（未対応に戻す）。
 */
export function setFollowUpStatus(
  customerId:  string,
  targetMonth: string,
  status:      FollowUpStatus,
): CustomerPrediction {
  const all = loadPredictions()
  const idx = all.findIndex(
    (p) => p.customerId === customerId && p.targetMonth === targetMonth,
  )

  if (idx >= 0) {
    const cur = all[idx]
    // 同じ状態を押したら解除（トグル）
    const next = cur.followUpStatus === status ? undefined : status
    const updated: CustomerPrediction = { ...cur, followUpStatus: next, updatedAt: new Date().toISOString() }
    all[idx] = updated
    savePredictions(all)
    return updated
  }

  // 予測未入力の顧客でも状態だけ記録できるよう、空の予測レコードを作る
  const created: CustomerPrediction = {
    customerId, targetMonth,
    predictedVisits: 0, predictedRevenue: 0, memo: '',
    followUpStatus: status,
    updatedAt: new Date().toISOString(),
  }
  all.push(created)
  savePredictions(all)
  return created
}

// ---------- 月キーユーティリティ ----------
import { prevMonthKey } from './prediction-utils'

// ---------- 月別実績集計（order-metrics.ts に委譲） ----------

/** 月全体実績。order-metrics.getMonthGrandTotal の後方互換ラッパー。 */
export function getMonthGrandTotal(
  allOrders: HappOrder[], links: CustomerLink[], customers: Customer[], monthKey: string,
): MonthGrandTotal {
  return _getMonthGrandTotal(allOrders, links, customers, monthKey)
}

/** 顧客別月次実績。order-metrics.getCustomerMonthActuals の後方互換ラッパー。 */
export function getMonthActuals(
  allOrders: HappOrder[], links: CustomerLink[], customers: Customer[], monthKey: string,
): Map<string, MonthActual> {
  return getCustomerMonthActuals(allOrders, links, customers, monthKey)
}

// ---------- 顧客の参考情報（予測入力フォーム用） ----------

function completedOrdersForMonth(orders: HappOrder[], monthKey: string): HappOrder[] {
  const prefix = monthKey.replace('-', '/')
  return orders.filter(o => o.startTime.startsWith(prefix) && isBookableOrder(o))
}

function calcAvgVisitInterval(completedOrders: HappOrder[]): number | null {
  if (completedOrders.length < 2) return null
  const dates = completedOrders
    .map(o => new Date(o.startTime.slice(0, 10).replace(/\//g, '-')).getTime())
    .sort((a, b) => a - b)
  const diffs: number[] = []
  for (let i = 1; i < dates.length; i++) diffs.push((dates[i] - dates[i - 1]) / 86_400_000)
  return Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length)
}

export function getCustomerPredictionContext(
  customerOrders: HappOrder[],
  targetMonth: string,
): CustomerPredictionContext {
  const completed = customerOrders.filter(isBookableOrder)
  const futures   = customerOrders.filter(o => isFutureReservation(o))

  const lastMonthKey = prevMonthKey(targetMonth, 1)
  const lmCompleted  = completedOrdersForMonth(customerOrders, lastMonthKey)
  const lastMonth: MonthActual = {
    visitCount: lmCompleted.length,
    amount:     lmCompleted.reduce((s, o) => s + o.totalAmount, 0),
  }

  let total3v = 0, total3a = 0
  for (let i = 1; i <= 3; i++) {
    const mos = completedOrdersForMonth(customerOrders, prevMonthKey(targetMonth, i))
    total3v += mos.length
    total3a += mos.reduce((s, o) => s + o.totalAmount, 0)
  }
  const avg3months: MonthActual = {
    visitCount: Math.round((total3v / 3) * 10) / 10,
    amount:     Math.round(total3a / 3),
  }

  let lastVisitDate: string | null = null
  if (completed.length > 0) {
    const latest = completed.reduce((a, b) => (a.startTime > b.startTime ? a : b))
    lastVisitDate = latest.startTime.slice(0, 10).replace(/\//g, '-')
  }

  let nextReservation: string | null = null
  if (futures.length > 0) {
    const earliest = futures.reduce((a, b) => (a.startTime < b.startTime ? a : b))
    nextReservation = earliest.startTime.slice(0, 10).replace(/\//g, '-')
  }

  return {
    lastMonth, avg3months, lastVisitDate, nextReservation,
    totalVisitCount:  completed.length,
    totalAmount:      completed.reduce((s, o) => s + o.totalAmount, 0),
    avgVisitInterval: calcAvgVisitInterval(completed),
  }
}
