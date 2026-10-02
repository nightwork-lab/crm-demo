/**
 * happ オーダー実データに基づく来店アラート。
 * - customer-links.json の manual link のみ使用
 * - order-metrics.ts の getCustomerLifetimeStats を使用
 * - 名前一致・手入力 lastVisit は使わない
 */

import { readFileSync } from 'fs'
import { dataPath } from './data-dir'
import { loadCustomers, type Customer } from './data'
import { loadCustomerLinks, type CustomerLink } from './customer-link'
import {
  getCustomerLifetimeStats,
  type ComputedStats,
} from './order-metrics'
import type { HappOrder, HappOrdersFile } from './happ-order'

export type HappAlertLevel = 'critical' | 'warning' | 'info'

export type HappAlert = {
  customer:        Customer
  daysSinceVisit:  number
  lastVisitDate:   string
  nextReservation: string | null
  visitCount:      number
  completedAmount: number
  level:           HappAlertLevel
  message:         string
}

function loadAllOrders(): HappOrder[] {
  try {
    const raw  = readFileSync(dataPath('happ-orders.json'), 'utf-8')
    const file = JSON.parse(raw) as HappOrdersFile
    return file.orders ?? []
  } catch {
    return []
  }
}

/**
 * happ オーダーから顧客ごとの来店アラートを返す。
 *
 * 判定ルール:
 *  - customer-links.json 紐付き済み顧客のみ
 *  - 来店実績なし → スキップ
 *  - nextReservation あり → スキップ
 *  - 30日未満 → 対象外
 *  - 30〜59日 → info
 *  - 60〜89日 → warning
 *  - 90日以上 → critical
 */
export function getHappAlerts(
  today?: string,
  preloaded?: { allOrders: HappOrder[]; links: CustomerLink[]; customers: Customer[] },
): HappAlert[] {
  const t       = today ?? new Date().toISOString().slice(0, 10)
  const todayMs = new Date(t).getTime()

  const customers = preloaded?.customers ?? loadCustomers()
  const links     = preloaded?.links     ?? loadCustomerLinks()
  const allOrders = preloaded?.allOrders ?? loadAllOrders()

  const statsMap = getCustomerLifetimeStats(allOrders, links, customers, t)

  const alerts: HappAlert[] = []

  for (const customer of customers) {
    const stats: ComputedStats | undefined = statsMap.get(customer.id)
    if (!stats) continue
    if (customer.alertExcluded) continue
    if (!stats.lastVisitDate) continue
    if (stats.nextReservation) continue

    const lastMs         = new Date(stats.lastVisitDate).getTime()
    const daysSinceVisit = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24))
    if (daysSinceVisit < 30) continue

    let level: HappAlertLevel
    let message: string
    if (daysSinceVisit >= 90) {
      level   = 'critical'
      message = `${Math.floor(daysSinceVisit / 30)}ヶ月以上来店なし`
    } else if (daysSinceVisit >= 60) {
      level   = 'warning'
      message = `${daysSinceVisit}日来店なし`
    } else {
      level   = 'info'
      message = `${daysSinceVisit}日来店なし`
    }

    alerts.push({
      customer,
      daysSinceVisit,
      lastVisitDate:   stats.lastVisitDate,
      nextReservation: stats.nextReservation,
      visitCount:      stats.visitCount,
      completedAmount: stats.completedAmount,
      level,
      message,
    })
  }

  return alerts.sort((a, b) => b.daysSinceVisit - a.daysSinceVisit)
}
