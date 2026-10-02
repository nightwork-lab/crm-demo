/**
 * オーナーアカウント経由の全セラピスト同期（Phase 7 / B案）。
 *
 * 構成:
 *   - パース関数（純粋関数）: 保存HTMLでもライブページでも動く。テスト可能。
 *   - ナビゲーション: Playwright でオーナー画面を遷移。
 *   - 書き込み: therapist_id 別に Supabase へ upsert + 取得期間内の欠落分を削除。
 *
 * 認証情報は HAPP_OWNER_TEL / HAPP_OWNER_PASS（運営が Railway 等で設定する。
 * 開発者のローカル .env.local には置かない運用を想定）。
 */
import type { Page } from 'playwright'
import { parseModalBody } from './happ-sync'
import { createSupabaseServerClient } from './supabase-server'
import type { HappOrder } from './happ-order'

// ── URL（初回実機確認で要検証） ──────────────────────────────────────
const OWNER_BASE             = 'https://happ-s.com/control/owner'
export const OWNER_LOGIN_URL = `${OWNER_BASE}/login/`          // TODO: 初回実行時に実URLを確認
const ORDER_STATUS_URL       = `${OWNER_BASE}/orderStatusTherapist/`

// ── パース（純粋関数） ────────────────────────────────────────────────

export type HappTherapist = {
  workerId: number
  label:    string   // "まさき(28)168" 形式
}

/** セラピスト選択 select から一覧を抽出する。 */
export function parseTherapistOptions(html: string): HappTherapist[] {
  const selects = html.match(/<select[^>]*name="worker_id"[^>]*>[\s\S]*?<\/select>/g) ?? []
  const result: HappTherapist[] = []
  for (const select of selects) {
    for (const m of select.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)<\/option>/g)) {
      const label = m[2].trim()
      // セラピスト形式「名前(数字)数字」のみ採用（"全員" 等のプレースホルダーを除外）
      if (!/\(\d+\)\d+/.test(label)) continue
      result.push({ workerId: parseInt(m[1], 10), label })
    }
    if (result.length > 0) break  // 最初に見つかった worker_id select を採用
  }
  return result
}

export type ParsedDayOrders = {
  orders:    HappOrder[]
  /** 取得画面に含まれていた日付（"YYYY/MM/DD"）。リコンサイル範囲の決定に使う。 */
  dateRange: { from: string; to: string } | null
}

function unescapeAttr(raw: string): string {
  return raw
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/**
 * オーダー状況ページの HTML からオーダーを抽出する。
 * 日付見出し（YYYY年MM月DD日）とモーダルの出現順で日付を対応付け、
 * 年を見出しから補正する（モーダル内の日付は年を含まないため）。
 *
 * 同一ページ内に同じオーダーが複数回現れることがあるため（表示の都合上）、
 * orderId で重複を排除する。これを怠ると Supabase の upsert が
 * 「ON CONFLICT DO UPDATE command cannot affect row a second time」で失敗する。
 */
export function parseOrderStatusPage(html: string, syncedAt: string): ParsedDayOrders {
  const tokens = [...html.matchAll(/(\d{4})年(\d{2})月(\d{2})日|data-modal-body="([^"]+)"/g)]

  const byOrderId = new Map<number, HappOrder>()
  const dates: string[] = []
  let currentDate: { y: string; m: string; d: string } | null = null

  for (const t of tokens) {
    if (t[1]) {
      currentDate = { y: t[1], m: t[2], d: t[3] }
      dates.push(`${t[1]}/${t[2]}/${t[3]}`)
      continue
    }
    if (!t[4] || !currentDate) continue

    const order = parseModalBody(unescapeAttr(t[4]), 'orderList', syncedAt)
    if (!order) continue

    // 年補正: 見出しの年を採用。年跨ぎ（12/31→1/1）は終了時刻のみ +1 年。
    order.startTime = order.startTime.replace(/^\d{4}/, currentDate.y)
    if (order.endTime) {
      const startMonth = parseInt(currentDate.m, 10)
      const endMonth   = parseInt(order.endTime.slice(5, 7), 10)
      const endYear    = startMonth === 12 && endMonth === 1
        ? String(parseInt(currentDate.y, 10) + 1)
        : currentDate.y
      order.endTime = order.endTime.replace(/^\d{4}/, endYear)
    }
    byOrderId.set(order.orderId, order)
  }

  const sorted = dates.sort()
  return {
    orders: [...byOrderId.values()],
    dateRange: sorted.length > 0 ? { from: sorted[0], to: sorted[sorted.length - 1] } : null,
  }
}

// ── 自己診断（顧客情報を一切含まない構造情報のみ） ────────────────────

export type PageDiagnostics = {
  url:             string
  title:           string
  isLoginPage:     boolean
  hasWorkerSelect: boolean
  modalCount:      number
  dateHeaderCount: number
  tableCount:      number
  htmlLength:      number
}

/**
 * 失敗時の原因特定用に、ページの「構造情報だけ」を収集する。
 * 顧客名・金額・電話番号などの中身は一切含まない。
 */
export async function collectDiagnostics(page: Page): Promise<PageDiagnostics> {
  const html = await page.content()
  return {
    url:             page.url().split('?')[0],  // クエリ（ID等）は落とす
    title:           await page.title(),
    isLoginPage:     page.url().includes('/login'),
    hasWorkerSelect: /name="worker_id"/.test(html),
    modalCount:      (html.match(/data-modal-body/g) ?? []).length,
    dateHeaderCount: (html.match(/\d{4}年\d{2}月\d{2}日/g) ?? []).length,
    tableCount:      (html.match(/<table/g) ?? []).length,
    htmlLength:      html.length,
  }
}

/** 例外を投げない診断ラッパー。診断自体の失敗で本処理を壊さない。 */
export async function safeDiagnose(page: Page): Promise<string> {
  try {
    return JSON.stringify(await collectDiagnostics(page))
  } catch {
    return '{"diag":"failed"}'
  }
}

// ── ナビゲーション（Playwright） ─────────────────────────────────────

/**
 * ログインフォームの入力欄を自動検出して認証情報を入力する。
 *
 * オーナー画面はセラピスト画面と入力欄の id が異なる（#tel/#pass ではない）。
 * 画面ごとの差異や将来の変更に耐えるため、以下の順で ID 欄を探す:
 *   1. 既知の候補セレクタ（#tel, name=login_id など）
 *   2. パスワード欄の直前にある可視のテキスト/メール/tel 入力欄
 */
async function fillLoginForm(page: Page, id: string, pass: string): Promise<void> {
  // パスワード欄は type="password" で一意に特定できる
  const passwordSel = 'input[type="password"]'
  await page.waitForSelector(passwordSel, { timeout: 15000 })

  // ID 欄: 既知候補 → 見つからなければパスワード欄以外の可視入力欄の先頭
  const idCandidates = [
    '#tel', '#login_id', '#loginId', '#user_id', '#userId', '#username', '#email',
    'input[name="tel"]', 'input[name="login_id"]', 'input[name="user_id"]',
    'input[name="username"]', 'input[name="email"]', 'input[name="id"]',
  ]

  let idFilled = false
  for (const sel of idCandidates) {
    const el = page.locator(sel).first()
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
      await el.fill(id)
      idFilled = true
      break
    }
  }

  if (!idFilled) {
    // フォールバック: password 以外の可視テキスト系入力の先頭を ID 欄とみなす
    const textInputs = page.locator(
      'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])',
    )
    const count = await textInputs.count()
    for (let i = 0; i < count; i++) {
      const el = textInputs.nth(i)
      if (await el.isVisible().catch(() => false)) {
        await el.fill(id)
        idFilled = true
        break
      }
    }
  }

  if (!idFilled) throw new Error('ログインID入力欄が見つかりませんでした')

  await page.locator(passwordSel).first().fill(pass)

  // 送信: submit ボタン → 無ければ Enter キー
  const submit = page.locator('button[type="submit"], input[type="submit"]').first()
  if (await submit.count() > 0) {
    await submit.click()
  } else {
    await page.locator(passwordSel).first().press('Enter')
  }
}

export async function loginOwner(page: Page): Promise<void> {
  // HAPP_OWNER_ID を優先。互換のため HAPP_OWNER_TEL も受け付ける
  const id   = process.env.HAPP_OWNER_ID || process.env.HAPP_OWNER_TEL
  const pass = process.env.HAPP_OWNER_PASS
  if (!id || !pass) throw new Error('HAPP_OWNER_ID（または HAPP_OWNER_TEL）/ HAPP_OWNER_PASS が未設定です')

  await page.goto(OWNER_LOGIN_URL, { waitUntil: 'domcontentloaded' })
  await fillLoginForm(page, id, pass)
  await page.waitForLoadState('domcontentloaded')
  // 遷移待ち（SPA/リダイレクト両対応の保険）
  await page.waitForTimeout(2000)

  if (page.url().includes('/login')) {
    throw new Error('オーナーアカウントのログインに失敗しました（ID/パスワードをご確認ください）')
  }
}

/** セラピスト一覧を取得する。 */
export async function fetchTherapists(page: Page): Promise<HappTherapist[]> {
  await page.goto(ORDER_STATUS_URL, { waitUntil: 'domcontentloaded' })
  return parseTherapistOptions(await page.content())
}

/** 指定セラピスト・指定日を中心としたオーダー状況を取得する。 */
export async function fetchOrdersForTherapist(
  page: Page,
  workerId: number,
  date: { year: number; month: number; day: number },
  syncedAt: string,
): Promise<ParsedDayOrders> {
  // TODO: 初回実機確認 — パラメータ名（worker_id / year / month / day）と GET/POST を確認
  const url = `${ORDER_STATUS_URL}?worker_id=${workerId}&year=${date.year}&month=${date.month}&day=${date.day}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  return parseOrderStatusPage(await page.content(), syncedAt)
}

/**
 * 指定セラピストの「指定月」のオーダーを取得する。
 *
 * オーダー状況ページは指定日を中心に前後数週間を表示するため、
 * 月内の数日（1/11/21日）を起点に取得して結果をマージし、月全体をカバーする。
 * 取得後に対象月のオーダーだけを抽出して返す。
 */
export async function fetchOrdersForMonth(
  page: Page,
  workerId: number,
  year: number,
  month: number,
  syncedAt: string,
  waitMs = 1200,
): Promise<ParsedDayOrders> {
  const monthPrefix = `${year}/${String(month).padStart(2, '0')}`
  const byOrderId = new Map<number, HappOrder>()

  for (const day of [1, 11, 21]) {
    const parsed = await fetchOrdersForTherapist(page, workerId, { year, month, day }, syncedAt)
    for (const o of parsed.orders) {
      if (o.startTime.startsWith(monthPrefix)) byOrderId.set(o.orderId, o)
    }
    // happ への負荷配慮
    await page.waitForTimeout(waitMs + Math.random() * 500)
  }

  const orders = [...byOrderId.values()]
  const lastDay = new Date(year, month, 0).getDate()
  return {
    orders,
    dateRange: {
      from: `${monthPrefix}/01`,
      to:   `${monthPrefix}/${String(lastDay).padStart(2, '0')}`,
    },
  }
}

// ── Supabase 書き込み ────────────────────────────────────────────────

export type TherapistSyncResult = {
  therapistId: string
  workerId:    number
  fetched:     number
  removed:     number
  /** 実際に照合削除の対象にした範囲（null = 照合しなかった） */
  reconciled:  { from: string; to: string } | null
  /** 照合を安全側でスキップした理由（スキップしていなければ undefined） */
  reconcileSkipped?: string
}

export type UpsertOptions = {
  /**
   * 照合削除の下限日（"YYYY/MM/DD"）。省略時は dateRange.from。
   *
   * 日次同期はここに「見出し初日の翌日」を渡すこと。
   * オーダー状況ページの窓は「起点の4日前 05:00」から始まり、それより前に
   * 終わった深夜オーダーは初日の見出しの下に表示されない。初日を照合対象に
   * 含めると、その行が「範囲内なのに今回取れなかった」と判定されて消える
   * （2026-08-25 02:00 のオーダーが 8/29 の同期で消えた事故の原因）。
   */
  reconcileFrom?: string
  /**
   * 照合削除の上限日（"YYYY/MM/DD"）。省略時は dateRange.to。
   * 窓の上端の切り方は未確認のため、日次同期は「最終見出し日の前日」を渡す。
   */
  reconcileTo?: string
}

/** "YYYY/MM/DD" に n 日を足して同じ書式で返す（負数可） */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('/').map((s) => parseInt(s, 10))
  const next = new Date(Date.UTC(y, m - 1, d + n))
  return `${next.getUTCFullYear()}/${String(next.getUTCMonth() + 1).padStart(2, '0')}/${String(next.getUTCDate()).padStart(2, '0')}`
}

/** "YYYY/MM/DD" の翌日を同じ書式で返す */
export function dayAfter(ymd: string): string {
  return addDays(ymd, 1)
}

/**
 * 1セラピスト分のオーダーを Supabase に反映する。
 * - upsert: order_id 単位
 * - 削除: 照合範囲内 かつ 当該セラピスト所有 かつ 今回取得に含まれない行
 *   （オーナー画面はキャンセルを表示しないため、消えたオーダー＝キャンセル/削除）
 * - 安全弁: 今回の取得が 0 件なのに DB に範囲内の行があるときは削除しない
 *   （ページの読み込み失敗や構造変更で「全部消える」事故を防ぐ）
 */
export async function upsertTherapistOrders(
  therapistId: string,
  workerId:    number,
  parsed:      ParsedDayOrders,
  opts:        UpsertOptions = {},
): Promise<TherapistSyncResult> {
  const supabase = createSupabaseServerClient()

  // 保険: 呼び出し元が重複を含んでいても upsert が落ちないよう order_id で一意化する
  const uniqueOrders = [...new Map(parsed.orders.map((o) => [o.orderId, o])).values()]

  if (uniqueOrders.length > 0) {
    const rows = uniqueOrders.map((o) => ({
      order_id:        o.orderId,
      customer_id:     o.customerId,
      customer_name:   o.customerName,
      start_time:      o.startTime,
      end_time:        o.endTime ?? '',
      course:          o.course ?? '',
      payment_method:  o.paymentMethod ?? '',
      status:          o.status ?? '',
      internal_status: o.internalStatus ?? '',
      total_amount:    o.totalAmount ?? 0,
      therapist_fee:   o.therapistFee ?? 0,
      source:          o.source,
      synced_at:       o.syncedAt,
      therapist_id:    therapistId,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from('happ_orders')
        .upsert(rows.slice(i, i + 500), { onConflict: 'order_id' })
      if (error) throw new Error(`happ_orders upsert: ${error.message}`)
    }
  }

  // 期間内リコンサイル
  let removed = 0
  let reconciled: TherapistSyncResult['reconciled'] = null
  let reconcileSkipped: string | undefined
  if (parsed.dateRange) {
    const from = opts.reconcileFrom ?? parsed.dateRange.from
    const to   = opts.reconcileTo   ?? parsed.dateRange.to
    if (from > to) {
      // 見出しが1〜2日分しかない等で、端を除くと範囲が空になる場合は何もしない
      reconcileSkipped = `照合範囲が空（${from} > ${to}）`
    } else {
      reconciled = { from, to }
      const fetchedIds = new Set(uniqueOrders.map((o) => o.orderId))
      const { data, error } = await supabase
        .from('happ_orders')
        .select('order_id,start_time')
        .eq('therapist_id', therapistId)
        .gte('start_time', from)
        .lte('start_time', to + ' 23:59')
      if (error) throw new Error(`happ_orders 照会: ${error.message}`)

      const staleIds = (data ?? [])
        .map((r) => r.order_id as number)
        .filter((id) => !fetchedIds.has(id))

      if (staleIds.length > 0 && uniqueOrders.length === 0) {
        // 取得 0 件で既存行だけが「消えた」ように見える状況は、ページ側の異常の可能性が高い
        reconcileSkipped = `取得0件のため削除を保留（範囲内の既存 ${staleIds.length}件）`
      } else if (staleIds.length > 0) {
        const { error: delErr } = await supabase
          .from('happ_orders')
          .delete()
          .eq('therapist_id', therapistId)
          .in('order_id', staleIds)
        if (delErr) throw new Error(`happ_orders 削除: ${delErr.message}`)
        removed = staleIds.length
      }
    }
  }

  return { therapistId, workerId, fetched: uniqueOrders.length, removed, reconciled, reconcileSkipped }
}
