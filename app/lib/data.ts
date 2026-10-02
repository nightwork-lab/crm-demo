import { readFileSync } from 'fs'
import { dataPath } from './data-dir'

export type Customer = {
  id: string
  name: string
  lastVisit: string
  totalSales: number
  repeatCount: number
  nextReservation?: string
  memo: string
  tags?: string[]
  alertExcluded?: boolean
  alertExcludeReason?: string
  birthday?: string           // "MM-DD" または "YYYY-MM-DD"
  anniversaryExcluded?: boolean
  // 来店予測リストからの除外。'permanent'=もう来なそう（恒久） / 'temporary'=一時的
  predictionExclude?: 'permanent' | 'temporary'
  // 最終更新日時 ISO8601。ミラー時の「新しい方が勝つ」判定に使う。
  // 既存データ・happ 由来データには無い場合がある（その場合は最古扱い）。
  updatedAt?: string
  // 電話番号は個人情報最小化の観点から保持しない
}

// ---------- 静的データ ----------
// ダミー顧客は削除済み。実顧客は data/customers.json に保存される。
const STATIC_CUSTOMERS: Customer[] = []

// ---------- 動的ロード ----------

/**
 * 全顧客データを返す。STATIC_CUSTOMERS と data/customers.json をマージ。
 *
 * DB移行時: この関数本体を DB クエリに置換するだけ。
 */
export function loadCustomers(): Customer[] {
  const map = new Map<string, Customer>(STATIC_CUSTOMERS.map((c) => [c.id, c]))

  try {
    const raw  = readFileSync(dataPath('customers.json'), 'utf-8')
    const json = JSON.parse(raw) as Customer[]
    if (Array.isArray(json)) {
      for (const c of json) map.set(c.id, c)
    }
  } catch {
    // ファイル未作成またはパースエラーは無視
  }

  return [...map.values()].sort((a, b) => {
    const na = parseInt(a.id, 10)
    const nb = parseInt(b.id, 10)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.id.localeCompare(b.id)
  })
}

// ---------- アラート ----------

export type AlertLevel = 'critical' | 'warning' | 'info'

export type Alert = {
  customer: Customer
  daysSinceVisit: number
  level: AlertLevel
  message: string
}

export function getAlerts(today: string = new Date().toISOString().slice(0, 10)): Alert[] {
  const customers = loadCustomers()
  const todayDate = new Date(today)

  return customers
    .filter((c) => !c.nextReservation)
    .map((c) => {
      const lastVisitDate = new Date(c.lastVisit)
      const diff = Math.floor(
        (todayDate.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      let level: AlertLevel
      let message: string

      if (diff >= 90) {
        level = 'critical'
        message = `${Math.floor(diff / 30)}ヶ月以上来店なし`
      } else if (diff >= 30) {
        level = 'warning'
        message = `${Math.floor(diff / 30)}ヶ月来店なし`
      } else {
        level = 'info'
        message = `${diff}日来店なし`
      }

      return { customer: c, daysSinceVisit: diff, level, message }
    })
    .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit)
}

export function getSummary() {
  const customers     = loadCustomers()
  const totalCustomers = customers.length
  const totalSales    = customers.reduce((sum, c) => sum + c.totalSales, 0)
  const totalRepeats  = customers.reduce((sum, c) => sum + c.repeatCount, 0)
  const criticalAlerts = getAlerts().filter((a) => a.level === 'critical').length

  return { totalCustomers, totalSales, totalRepeats, criticalAlerts }
}
