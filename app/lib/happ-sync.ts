/**
 * happ-s.com からオーダーを取得・マージするコアロジック。
 * CLI (scripts/sync-happ.ts) と Server Action の両方から呼ばれる。
 */

import type { Page } from 'playwright'
import { writeFileSync, readFileSync, mkdirSync, renameSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import type { HappOrder, HappOrdersFile } from './happ-order'

const LOGIN_URL      = 'https://happ-s.com/control/worker/hs/login/'
const ORDER_LIST_URL = 'https://happ-s.com/control/worker/hs/orderList/'
const ORDER_CASH_URL = 'https://happ-s.com/control/worker/hs/orderListCash/'
const OUTPUT_PATH    = resolve(process.cwd(), 'data/happ-orders.json')
const TMP_PATH       = OUTPUT_PATH + '.tmp'

// ---------- 戻り値型 ----------

export type SyncResult =
  | {
      success:       true
      syncedAt:      string
      // 取得
      fetchedList:   number   // orderList 取得件数
      fetchedCash:   number   // orderListCash 取得件数
      // 結果
      newCount:      number   // 新規追加（orderId が既存になかった）
      updatedCount:  number   // 更新（orderId が既存にあり内容を上書き）
      totalCount:    number   // 保存済み総件数
      // source 別保存済み件数
      sourceCount:   Record<string, number>
      // 2026 サマリー
      count2026:     number   // 2026 年のオーダー件数
      upcomingCount: number   // 今日以降の予約件数
    }
  | {
      success: false
      error:   string
    }

// ---------- スキーマ検証 ----------

const VALID_SOURCES = new Set(['orderList', 'orderListCash', 'uriageTherapist'])

function isValidHappOrder(o: unknown): o is HappOrder {
  if (typeof o !== 'object' || o === null) return false
  const x = o as Record<string, unknown>
  return (
    Number.isInteger(x.orderId) && (x.orderId as number) > 0 &&
    typeof x.customerName === 'string' &&
    typeof x.startTime    === 'string' && x.startTime.length > 0 &&
    typeof x.source       === 'string' && VALID_SOURCES.has(x.source as string)
  )
}

function validateOrdersFile(data: unknown): data is HappOrdersFile {
  if (typeof data !== 'object' || data === null) return false
  const f = data as Record<string, unknown>
  return (
    typeof f.lastSyncedAt === 'string' &&
    Array.isArray(f.orders) &&
    (f.orders as unknown[]).every(isValidHappOrder)
  )
}

// ---------- 原子的 JSON 保存 ----------
// .tmp に書いてから rename → ファイル破損を防ぐ

function atomicSaveJson(data: HappOrdersFile): void {
  if (!validateOrdersFile(data)) {
    throw new Error('スキーマ検証失敗: 保存をキャンセルしました')
  }
  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(TMP_PATH, OUTPUT_PATH)
}

// ---------- パース用ユーティリティ ----------

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

function normalizeModalBody(raw: string): string {
  return raw
    .replace(/&amp;yen/g, '¥').replace(/&yen;/g, '¥').replace(/&yen/g, '¥')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function inferFullDate(mmddHHmm: string): string {
  if (!mmddHHmm) return ''
  const m = mmddHHmm.trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{2}:\d{2})$/)
  if (!m) return mmddHHmm.trim()
  const [, mm, dd, time] = m
  const now   = new Date()
  let year    = now.getFullYear()
  const month = parseInt(mm, 10)
  if (month > now.getMonth() + 4) year--
  return `${year}/${mm.padStart(2, '0')}/${dd.padStart(2, '0')} ${time}`
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0
  return parseInt(s.replace(/,/g, ''), 10) || 0
}

export function parseModalBody(
  raw: string,
  source: HappOrder['source'],
  syncedAt: string,
): HappOrder | null {
  const body = normalizeModalBody(raw)

  const orderId = parseInt(body.match(/オーダーID\s+(\d+)/)?.[1] ?? '0', 10)
  if (!orderId) return null

  return {
    orderId,
    customerId:     parseInt(body.match(/顧客ID\s+(\d+)/)?.[1] ?? '0', 10),
    customerName:   stripTags(body.match(/【お客様名】([\s\S]*?)様/)?.[1] ?? '').trim(),
    startTime:      inferFullDate(stripTags(body.match(/【開始時間】(.*?)(?:<br>|$)/)?.[1] ?? '').trim()),
    endTime:        inferFullDate(stripTags(body.match(/【終了時間】(.*?)(?:<br>|$)/)?.[1] ?? '').trim()),
    course:         stripTags(body.match(/【コース】(.*?)(?:<br>|$)/)?.[1] ?? '').trim(),
    area:           stripTags(body.match(/【利用エリア】(.*?)(?:<br>|$)/)?.[1] ?? '').trim(),
    paymentMethod:  stripTags(body.match(/【支払い方法】(.*?)(?:<br>|$)/)?.[1] ?? '').trim(),
    status:         '',
    internalStatus: stripTags(body.match(/【ステータス】(.*?)(?:<br>|$)/)?.[1] ?? '').trim(),
    totalAmount:    parseAmount(body.match(/合計金額\s*<span[^>]*>¥([\d,]+)<\/span>/)?.[1]),
    therapistFee:   parseAmount(body.match(/ギャラ\s*<span[^>]*>¥([\d,]+)<\/span>/)?.[1]),
    source,
    syncedAt,
  }
}

// ---------- ログイン ----------

async function login(page: Page): Promise<void> {
  const tel  = process.env.HAPP_TEL
  const pass = process.env.HAPP_PASS
  if (!tel || !pass) throw new Error('環境変数 HAPP_TEL / HAPP_PASS が未設定です')

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
  await page.fill('#tel', tel)
  await page.fill('#pass', pass)
  await page.click('button[type="submit"]')
  await page.waitForLoadState('domcontentloaded')

  if (page.url().includes('/login/')) {
    throw new Error('ログインに失敗しました。ID・パスワードを確認してください。')
  }
}

// ---------- ページ取得（バッチ化で高速化） ----------

/** page.evaluate() で1回のJS評価に集約してN往復を1往復に削減 */
type RowData = { modalBody: string | null; status: string }

async function batchExtractRows(page: Page, statusColIdx: number): Promise<RowData[]> {
  return page.evaluate((colIdx: number) =>
    Array.from(document.querySelectorAll('table tbody tr')).map(row => ({
      modalBody: row.querySelector('[data-modal-body]')?.getAttribute('data-modal-body') ?? null,
      status:    (row.querySelectorAll('td')[colIdx] as HTMLElement | undefined)?.innerText?.trim() ?? '',
    }))
  , statusColIdx)
}

async function fetchOrderList(page: Page, syncedAt: string): Promise<HappOrder[]> {
  await page.goto(ORDER_LIST_URL, { waitUntil: 'domcontentloaded' })
  const rows = await batchExtractRows(page, 2)   // 状態は index 2
  return rows.flatMap(({ modalBody, status }) => {
    if (!modalBody) return []
    const order = parseModalBody(modalBody, 'orderList', syncedAt)
    if (!order) return []
    order.status = status
    return [order]
  })
}

async function fetchOrderListCash(page: Page, syncedAt: string): Promise<HappOrder[]> {
  await page.goto(ORDER_CASH_URL, { waitUntil: 'domcontentloaded' })
  const rows = await batchExtractRows(page, 1)   // orderListCash は状態列なし
  return rows.flatMap(({ modalBody }) => {
    if (!modalBody) return []
    const order = parseModalBody(modalBody, 'orderListCash', syncedAt)
    if (!order) return []
    order.status = '現金未確認'
    return [order]
  })
}

// ---------- マージ ----------

export function loadExisting(): HappOrdersFile {
  try {
    const raw  = readFileSync(OUTPUT_PATH, 'utf-8')
    const data = JSON.parse(raw) as HappOrdersFile
    data.orders = data.orders.filter(
      (o): o is HappOrder => typeof o.orderId === 'number' && o.orderId > 0
    )
    return data
  } catch {
    return { lastSyncedAt: '', orders: [] }
  }
}

export function mergeOrders(existing: HappOrder[], incoming: HappOrder[]): HappOrder[] {
  const map     = new Map<number, HappOrder>(existing.map(o => [o.orderId, o]))
  const history = incoming.filter(o => o.source === 'uriageTherapist')
  const cash    = incoming.filter(o => o.source === 'orderListCash')
  const list    = incoming.filter(o => o.source === 'orderList')

  for (const order of [...history, ...cash, ...list]) {
    map.set(order.orderId, order)
  }

  return [...map.values()].sort((a, b) => {
    const diff = b.startTime.localeCompare(a.startTime)
    return diff !== 0 ? diff : b.orderId - a.orderId
  })
}

// ---------- 集計ヘルパー ----------

function countBySource(orders: HappOrder[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const o of orders) m[o.source] = (m[o.source] ?? 0) + 1
  return m
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '/')
}

// ---------- メインエントリ ----------

const MAX_RETRIES = 3

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = MAX_RETRIES,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1) throw err
      const wait = (i + 1) * 3000   // 3s, 6s
      console.log(`[retry ${i + 1}/${retries - 1}] ${label} - ${wait / 1000}秒後に再試行`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw new Error('unreachable')
}

export async function runHappSync(): Promise<SyncResult> {
  if (!process.env.HAPP_TEL || !process.env.HAPP_PASS) {
    return { success: false, error: '.env.local に HAPP_TEL と HAPP_PASS を設定してください' }
  }

  if (existsSync(TMP_PATH)) { try { unlinkSync(TMP_PATH) } catch {} }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--ignore-certificate-errors',           // TLS 交渉エラーを回避
      '--disable-web-security',
      '--no-sandbox',
    ],
  })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page    = await context.newPage()

  try {
    await withRetry(() => login(page), 'ログイン')

    const syncedAt   = new Date().toISOString()
    const cashOrders = await withRetry(() => fetchOrderListCash(page, syncedAt), 'orderListCash')
    const listOrders = await withRetry(() => fetchOrderList(page, syncedAt),     'orderList')
    const incoming   = [...cashOrders, ...listOrders]

    const existing    = loadExisting()
    const existingIds = new Set(existing.orders.map(o => o.orderId))
    const newCount     = incoming.filter(o => !existingIds.has(o.orderId)).length
    const updatedCount = incoming.filter(o =>  existingIds.has(o.orderId)).length

    const merged = mergeOrders(existing.orders, incoming)

    const fileData: HappOrdersFile = { lastSyncedAt: syncedAt, orders: merged }
    atomicSaveJson(fileData)

    const today = todayStr()
    return {
      success: true,
      syncedAt,
      fetchedList:   listOrders.length,
      fetchedCash:   cashOrders.length,
      newCount,
      updatedCount,
      totalCount:    merged.length,
      sourceCount:   countBySource(merged),
      count2026:     merged.filter(o => o.startTime.startsWith('2026/')).length,
      upcomingCount: merged.filter(o =>
        o.startTime.slice(0, 10).replace(/\//g, '-') >= today
      ).length,
    }
  } catch (err) {
    if (existsSync(TMP_PATH)) { try { unlinkSync(TMP_PATH) } catch {} }
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await browser.close()
  }
}
