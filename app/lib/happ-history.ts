/**
 * uriageTherapist ページを使った過去データ取得ロジック。
 * 月次ページ → 稼働日抽出 → 日次ページ取得 → modal-body パース の流れ。
 *
 * 既存の parseModalBody / mergeOrders / loadExisting を再利用する。
 */

import { type Page } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import type { HappOrder, HappOrdersFile } from './happ-order'
import { parseModalBody, mergeOrders, loadExisting } from './happ-sync'

const URIAGE_BASE = 'https://happ-s.com/control/worker/hs/uriageTherapist'
const OUTPUT_PATH = resolve(process.cwd(), 'data/happ-orders.json')

// ---------- 型定義 ----------

export type HistorySyncResult = {
  year:           number
  month:          number
  activeDays:     number
  fetched:        number
  added:          number
  duplicates:     number
  removed:        number     // happ側で削除されていたため自動削除した件数
  removedInfo:    string[]   // 削除した行の概要（"7/14 山田 ¥25,300" 等）
  totalSaved:     number
  customerNames:  string[]
  orderIds:       number[]
  errors:         string[]   // 日次取得に失敗した場合のエラーメッセージ
}

// ---------- ユーティリティ ----------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function sleepRandom(): Promise<void> {
  return sleep(500 + Math.random() * 500)
}

/**
 * inferFullDate() は現在年を使うため、過去データでは年が狂う。
 * 取得日（dateStr = "YYYY-MM-DD"）の年で強制補正する。
 * 年越しオーダー（12/31 → 1/1）は開始月と終了月で判定して year+1。
 */
function fixOrderYear(order: HappOrder, dateStr: string): void {
  const correctYear = dateStr.slice(0, 4)

  if (order.startTime) {
    order.startTime = order.startTime.replace(/^\d{4}/, correctYear)
  }

  if (order.endTime) {
    const startMonth = parseInt(dateStr.slice(5, 7), 10)
    const endMonthMatch = order.endTime.match(/^\d{4}\/(\d{2})\//)
    const endMonth = endMonthMatch ? parseInt(endMonthMatch[1], 10) : startMonth
    const endYear = (startMonth === 12 && endMonth === 1)
      ? String(parseInt(correctYear, 10) + 1)
      : correctYear
    order.endTime = order.endTime.replace(/^\d{4}/, endYear)
  }
}

// ---------- 月次ページから稼働日リストを取得 ----------

type ActiveDay = {
  date:       string
  orderCount: number
}

async function fetchActiveDays(
  page: Page,
  year: number,
  month: number,
  log: (msg: string) => void,
): Promise<ActiveDay[]> {
  const url = `${URIAGE_BASE}/?date_mode=month&year=${year}&month=${month}`
  log(`月次ページ: ${year}年${String(month).padStart(2,'0')}月`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const rows = await page.locator('table tbody tr').all()
  const activeDays: ActiveDay[] = []

  for (const row of rows) {
    const cells = await row.locator('td').allInnerTexts()
    if (!cells[4]) continue
    const countMatch = cells[4].match(/^(\d+)件$/)
    if (!countMatch || parseInt(countMatch[1], 10) === 0) continue

    const href = await row.locator('a').first().getAttribute('href').catch(() => null)
    if (!href) continue
    const dateMatch = href.match(/date=(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue

    activeDays.push({ date: dateMatch[1], orderCount: parseInt(countMatch[1], 10) })
  }

  log(`  稼働日: ${activeDays.length}日 / 予定件数: ${activeDays.reduce((s, d) => s + d.orderCount, 0)}件`)
  return activeDays
}

// ---------- 日次ページからオーダーを取得 ----------

async function fetchDayOrders(
  page: Page,
  date: string,
  syncedAt: string,
  log: (msg: string) => void,
): Promise<HappOrder[]> {
  const url = `${URIAGE_BASE}/?date_mode=day&date=${date}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const rows   = await page.locator('table tbody tr').all()
  const orders: HappOrder[] = []

  for (const row of rows) {
    const rawBody = await row.locator('[data-modal-body]').first()
      .getAttribute('data-modal-body').catch(() => null)
    if (!rawBody) continue

    const order = parseModalBody(rawBody, 'uriageTherapist', syncedAt)
    if (!order) continue

    order.status = (await row.locator('td').nth(6).innerText().catch(() => '')).trim()
    fixOrderYear(order, date)

    orders.push(order)
  }

  log(`  ${date}: ${orders.length}件 [${orders.map(o => `#${o.orderId}`).join(', ')}]`)
  return orders
}

// ---------- 1ヶ月分の取得 ----------

/**
 * uriageTherapist から指定年月のオーダーを全件取得して JSON にマージ保存する。
 */
export async function fetchHistoricalMonth(
  page: Page,
  year: number,
  month: number,
  log: (msg: string) => void = console.log,
): Promise<HistorySyncResult> {
  const syncedAt = new Date().toISOString()
  const errors: string[] = []

  const activeDays = await fetchActiveDays(page, year, month, log)

  const allFetched: HappOrder[] = []

  for (const day of activeDays) {
    await sleepRandom()
    try {
      const dayOrders = await fetchDayOrders(page, day.date, syncedAt, log)
      allFetched.push(...dayOrders)
    } catch (err) {
      const msg = `${day.date}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      log(`  ⚠ エラー: ${msg}`)
    }
  }

  const existing   = loadExisting()
  const existingIds = new Set(existing.orders.map(o => o.orderId))
  const added      = allFetched.filter(o => !existingIds.has(o.orderId)).length
  const duplicates = allFetched.filter(o =>  existingIds.has(o.orderId)).length

  let merged = mergeOrders(existing.orders, allFetched)

  // ── 幽霊オーダーの自動削除 ─────────────────────────────────────────
  // happ の月次ページに存在しない当該月のオーダーを削除する。
  // 取得エラーがあった場合は誤削除を防ぐためスキップ（安全側に倒す）。
  const monthPrefix = `${year}/${String(month).padStart(2, '0')}`
  const fetchedIds  = new Set(allFetched.map(o => o.orderId))
  const removedInfo: string[] = []

  if (errors.length === 0) {
    merged = merged.filter(o => {
      const inMonth = o.startTime.startsWith(monthPrefix)
      if (!inMonth || fetchedIds.has(o.orderId)) return true
      removedInfo.push(
        `${o.startTime.slice(5, 10)} ${o.customerName} ¥${o.totalAmount.toLocaleString()} #${o.orderId}`,
      )
      log(`  🗑 happ側で削除済みのため除去: #${o.orderId} ${o.customerName}`)
      return false
    })
  } else {
    log('  ⚠ 取得エラーがあったため幽霊オーダーの自動削除はスキップしました')
  }

  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  const output: HappOrdersFile = { lastSyncedAt: syncedAt, orders: merged }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8')

  return {
    year, month,
    activeDays:    activeDays.length,
    fetched:       allFetched.length,
    added,
    duplicates,
    removed:       removedInfo.length,
    removedInfo,
    totalSaved:    merged.length,
    customerNames: [...new Set(allFetched.map(o => o.customerName))].sort(),
    orderIds:      [...new Set(allFetched.map(o => o.orderId))].sort((a, b) => a - b),
    errors,
  }
}
