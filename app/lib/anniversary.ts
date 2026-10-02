import type { HappOrder } from './happ-order'
import type { CustomerLink } from './customer-link'
import { resolveOrderCustomer } from './customer-link'
import type { Customer } from './data'
import {
  getCustomerLifetimeStats,
  type ComputedStats,
} from './order-metrics'

// ---------- 型定義 ----------

export type AnniversaryKind = 'birthday' | 'first_months' | 'first_years'

export type AnniversaryAlert = {
  customer:       Customer
  kind:           AnniversaryKind
  label:          string       // "誕生日", "初回から3ヶ月", "初回から2年"
  months?:        number
  years?:         number
  date:           string       // "YYYY-MM-DD" 実際の記念日
  daysUntil:      number       // 0 = 今日, 正 = 何日後
  firstVisitDate: string | null
  stats:          ComputedStats
}

// ---------- 初回来店日の一括取得 ----------

/**
 * 全オーダーから顧客ごとの初回来店日（最古 startTime）を返す。
 * resolveOrderCustomer 経由の happCustomerId ベース。名前一致なし。
 */
export function getFirstVisitDates(
  allOrders: HappOrder[],
  links:     CustomerLink[],
  customers: Customer[],
): Map<string, string> {
  const map = new Map<string, string>()

  for (const order of allOrders) {
    const res = resolveOrderCustomer(order, links, customers)
    if (res.type !== 'linked') continue

    const id      = res.customer.id
    const dateStr = order.startTime.slice(0, 10).replace(/\//g, '-')
    const current = map.get(id)
    if (!current || dateStr < current) map.set(id, dateStr)
  }

  return map
}

/**
 * 単顧客の初回来店日を、その顧客のオーダーリストから直接計算する。
 * 顧客詳細ページなど1顧客分しか必要ない場面で使う。
 */
export function getFirstVisitDateFromOrders(orders: HappOrder[]): string | null {
  if (orders.length === 0) return null
  const earliest = orders.reduce((a, b) => (a.startTime < b.startTime ? a : b))
  return earliest.startTime.slice(0, 10).replace(/\//g, '-')
}

// ---------- 出会い期間の計算 ----------

export type MeetingDuration = {
  totalMonths: number
  years:       number
  months:      number
  label:       string   // "3ヶ月", "1年2ヶ月"
}

export function calcMeetingDuration(firstVisitDate: string, today: string): MeetingDuration {
  const a = new Date(firstVisitDate)
  const b = new Date(today)
  const totalMonths = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  const years  = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const label  = years === 0
    ? `${months}ヶ月`
    : months === 0 ? `${years}年` : `${years}年${months}ヶ月`
  return { totalMonths, years, months, label }
}

// ---------- 誕生日の次回日付 ----------

/**
 * 誕生日（"MM-DD" または "YYYY-MM-DD"）から、今日以降の次回誕生日日付を返す。
 */
function nextBirthdayDate(birthday: string, today: string): string {
  const mmdd     = birthday.length === 5 ? birthday : birthday.slice(5)
  const thisYear = today.slice(0, 4)
  const candidate = `${thisYear}-${mmdd}`
  if (candidate >= today) return candidate
  return `${parseInt(thisYear) + 1}-${mmdd}`
}

// ---------- 月数加算 ----------

function addMonthsToDate(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function daysDiff(fromDate: string, toDate: string): number {
  return Math.round(
    (new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86_400_000,
  )
}

// ---------- 記念日アラートの生成 ----------

const MONTH_MILESTONES = [1, 3, 6]

/**
 * 今日から windowDays 日以内に来る記念日（誕生日・初回記念日）を返す。
 * 今日より前は含めない。
 */
export function getAnniversaryAlerts(
  customers:  Customer[],
  allOrders:  HappOrder[],
  links:      CustomerLink[],
  today?:     string,
  windowDays  = 30,
  preloaded?: { statsMap?: Map<string, ComputedStats>; firstVisitMap?: Map<string, string> },
): AnniversaryAlert[] {
  const t            = today ?? new Date().toISOString().slice(0, 10)

  const statsMap      = preloaded?.statsMap     ?? getCustomerLifetimeStats(allOrders, links, customers, t)
  const firstVisitMap = preloaded?.firstVisitMap ?? getFirstVisitDates(allOrders, links, customers)

  const alerts: AnniversaryAlert[] = []

  for (const customer of customers) {
    if (customer.anniversaryExcluded) continue

    const stats        = statsMap.get(customer.id) ?? {
      visitCount: 0, completedAmount: 0, completedFee: 0,
      lastVisitDate: null, nextReservation: null, totalOrderCount: 0,
    }
    const firstVisit   = firstVisitMap.get(customer.id) ?? null

    // ---- 誕生日 ----
    if (customer.birthday) {
      const date      = nextBirthdayDate(customer.birthday, t)
      const daysUntil = daysDiff(t, date)
      if (daysUntil >= 0 && daysUntil <= windowDays) {
        alerts.push({
          customer, kind: 'birthday', label: '誕生日',
          date, daysUntil, firstVisitDate: firstVisit, stats,
        })
      }
    }

    // ---- 初回来店記念日 ----
    if (!firstVisit) continue

    // 月単位マイルストーン（1, 3, 6ヶ月）
    for (const m of MONTH_MILESTONES) {
      const date      = addMonthsToDate(firstVisit, m)
      const daysUntil = daysDiff(t, date)
      if (daysUntil >= 0 && daysUntil <= windowDays) {
        alerts.push({
          customer, kind: 'first_months', label: `初回から${m}ヶ月`,
          months: m, date, daysUntil, firstVisitDate: firstVisit, stats,
        })
      }
    }

    // 年単位マイルストーン（1年〜）
    for (let yr = 1; yr <= 30; yr++) {
      const date      = addMonthsToDate(firstVisit, yr * 12)
      const daysUntil = daysDiff(t, date)
      if (daysUntil < 0) continue     // 過去 → skip
      if (daysUntil > windowDays) break  // 30日超 → 以降も遠い
      alerts.push({
        customer, kind: 'first_years', label: `初回から${yr}年`,
        years: yr, date, daysUntil, firstVisitDate: firstVisit, stats,
      })
    }
  }

  return alerts.sort((a, b) => a.daysUntil - b.daysUntil)
}
