/**
 * 予約（今日以降の happ オーダー）を Google カレンダーへ一括反映する。
 *
 * 確定予約と仮予約は**別カレンダー**へ書き込む。仮予約は変更が激しいため、
 * 荒れても確定側に影響が出ないようにし、Google 側で表示のON/OFFも切り替えられる。
 *
 * 削除について:
 * - 通常の同期は**何も削除しない**。消えた予約はタイトルに【キャンセル】を付けて残す
 * - 仮予約由来のイベントに限り、専用の後始末（runTentativePurge）で削除できる。
 *   確定予約・過去の予定・手で入れた予定は、この経路でも削除対象にならない
 *
 * 所要時間は happ の endTime をそのまま使う。150分以上のコースは複数コースの
 * 組み合わせでオーダーが作られるため、course 名の分数は実際の枠を表さない
 * （実測: 全1372件中、実時間がコース時間より短い例はゼロ）。
 */
import type { HappOrder } from './happ-order'
import { isFutureReservation } from './customer-stats'
import { isCanceledOrder } from './order-metrics'
import {
  EVENT_SOURCE_TAG, isOwnEvent, isDeletableTentative,
  type CalendarClient, type CalendarEvent, type ReservationKind,
} from './google-calendar'

const TIME_ZONE = 'Asia/Tokyo'

/** endTime が空のオーダーで使う既定の所要時間（分）。 */
const FALLBACK_MINUTES = 60

/** キャンセル済みを示す接頭辞。付け直しても増殖しないよう判定にも使う。 */
export const CANCEL_PREFIX = '【キャンセル】'

/** 仮予約を示す接頭辞。別カレンダーに入るが、重ねて表示したとき区別できるようにする。 */
export const TENTATIVE_PREFIX = '【仮】'

/** 既存イベントを照合する範囲（今日からの日数）。過去は見ない（済んだ予約の履歴を守るため）。 */
const RECONCILE_FUTURE_DAYS = 400

export type SyncPlan = {
  toInsert: CalendarEvent[]
  toUpdate: CalendarEvent[]
  /** 予約が消えたためタイトルに【キャンセル】を付けるもの。削除はしない。 */
  toCancel: CalendarEvent[]
  unchanged: number
  /** 同じIDだがこのアプリ製と確認できず、触らなかったイベントのID */
  conflicts: string[]
}

type SyncCounts = {
  inserted:  number
  updated:   number
  canceled:  number
  unchanged: number
  conflicts: string[]
  targetCount: number
  fallbackOrderIds: number[]
  skippedOrderIds:  number[]
  /** 利用エリアが未取得の予約の orderId（happ 同期前の既存データ） */
  noAreaOrderIds: number[]
  configured: boolean
  missingEnvKeys?: string[]
  range: { from: string; to: string } | null
}

export type CalendarSyncResult =
  | ({ success: true; dryRun: boolean; kind: ReservationKind } & SyncCounts)
  | { success: false; error: string }

export type PurgeTarget = { id: string; summary: string; startsAt: string }

export type PurgeResult =
  | { success: true; dryRun: boolean; targets: PurgeTarget[]; deleted: number; skipped: number }
  | { success: false; error: string }

// ---------- 日時ユーティリティ ----------

/** "YYYY/MM/DD HH:mm" を RFC3339 のローカル表記へ変換する。 */
function toRfc3339(happTime: string): string | null {
  const m = happTime.match(/^(\d{4})[/-](\d{2})[/-](\d{2}) (\d{2}):(\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`
}

/** オーダーの開始日を "YYYY-MM-DD" で返す。JSON（/区切り）・Supabase（-区切り）両対応。 */
function startDate(order: HappOrder): string {
  return order.startTime.slice(0, 10).replace(/\//g, '-')
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMinutes(rfc3339: string, minutes: number): string {
  const d = new Date(`${rfc3339}Z`)
  d.setUTCMinutes(d.getUTCMinutes() + minutes)
  return d.toISOString().slice(0, 19)
}

// ---------- 対象の選定 ----------

/**
 * カレンダーに載せる予約を選ぶ。
 * キャンセル判定は order-metrics の isCanceledOrder を再利用し、独自判定を作らない。
 */
export function selectTargets(
  orders: HappOrder[], today: string, kind: ReservationKind,
): HappOrder[] {
  if (kind === 'confirmed') {
    // 確定側は既存の「次回予約」判定をそのまま使う（キャンセル・仮予約を除外）
    return orders.filter(o => isFutureReservation(o, today))
  }
  return orders.filter(o =>
    !isCanceledOrder(o) && o.internalStatus === '仮予約' && startDate(o) >= today,
  )
}

// ---------- イベントの組み立て ----------

/**
 * Google のイベントIDは base32hex（a〜v と 0〜9）で5文字以上という制約がある。
 * "happ" はいずれも a〜v の範囲に収まるため、そのまま接頭辞に使える。
 */
export function toEventId(orderId: number): string {
  return `happ${orderId}`
}

// 書き込み可否・削除可否の判定は google-calendar.ts の1か所だけに置く。
// ここで書き写すと、片方だけ直したときに実態とずれる（バッジ表示で実際に踏んだ）。
export { isOwnEvent, isDeletableTentative }

/** 予約1件をカレンダーイベントへ変換する。変換できない場合は null。 */
export function buildEvent(
  order: HappOrder, includeCustomerName: boolean, kind: ReservationKind,
): { event: CalendarEvent; usedFallback: boolean; hasArea: boolean } | null {
  const start = toRfc3339(order.startTime)
  if (!start) return null

  let end = order.endTime ? toRfc3339(order.endTime) : null
  const usedFallback = end === null
  if (!end) end = addMinutes(start, FALLBACK_MINUTES)

  // 利用エリアを主表記にする。happ 同期前の既存データにはエリアが無いため、
  // その場合だけコース名にフォールバックして「無題の予定」を避ける。
  const area  = (order.area ?? '').trim()
  const label = area || order.course || '予約'
  const prefix = kind === 'tentative' ? TENTATIVE_PREFIX : ''

  const summary = includeCustomerName
    ? `${prefix}${order.customerName} ${label}`.trim()
    : `${prefix}${label}`

  // 顧客名なし版は外部共有の可能性があるため、金額・顧客情報を一切載せない
  const description = includeCustomerName
    ? [
        `顧客: ${order.customerName}`,
        area ? `利用エリア: ${area}` : '利用エリア: （未取得）',
        `コース: ${order.course}`,
        `金額: ¥${order.totalAmount.toLocaleString('ja-JP')}`,
        `支払: ${order.paymentMethod}`,
        `ステータス: ${order.status} / ${order.internalStatus}`,
        `happ オーダーID: ${order.orderId}`,
      ].join('\n')
    : `コース: ${order.course}`

  return {
    usedFallback,
    hasArea: area.length > 0,
    event: {
      id:     toEventId(order.orderId),
      summary,
      description,
      start:  { dateTime: start, timeZone: TIME_ZONE },
      end:    { dateTime: end,   timeZone: TIME_ZONE },
      status: kind === 'tentative' ? 'tentative' : 'confirmed',
      extendedProperties: {
        private: { source: EVENT_SOURCE_TAG, orderId: String(order.orderId), kind },
      },
    },
  }
}

// ---------- 差分 ----------

/**
 * 既存イベントと突き合わせて、追加・更新・キャンセル表記を決める。削除は生成しない。
 * @param today "YYYY-MM-DD"。これより前に始まる予定は履歴とみなし対象外にする。
 */
export function buildPlan(
  desired: CalendarEvent[], existing: CalendarEvent[], today: string,
): SyncPlan {
  const existingById = new Map(existing.map(e => [e.id, e]))
  const desiredIds   = new Set(desired.map(e => e.id))

  const toInsert: CalendarEvent[] = []
  const toUpdate: CalendarEvent[] = []
  const toCancel: CalendarEvent[] = []
  const conflicts: string[] = []
  let unchanged = 0

  for (const e of desired) {
    const prev = existingById.get(e.id)
    if (!prev) { toInsert.push(e); continue }
    if (!isOwnEvent(prev)) { conflicts.push(prev.id); continue }

    const same =
      prev.summary         === e.summary &&
      prev.description     === e.description &&
      prev.start?.dateTime === e.start.dateTime &&
      prev.end?.dateTime   === e.end.dateTime &&
      (prev.status ?? 'confirmed') === (e.status ?? 'confirmed')
    if (same) unchanged++
    else toUpdate.push(e)
  }

  for (const prev of existing) {
    if (desiredIds.has(prev.id)) continue
    if (!isOwnEvent(prev)) continue                                   // 他人の予定は触らない
    if ((prev.start?.dateTime?.slice(0, 10) ?? '') < today) continue  // 過去は履歴として残す
    if (prev.summary?.startsWith(CANCEL_PREFIX)) continue             // 既に印がある

    toCancel.push({
      ...prev,
      summary:     `${CANCEL_PREFIX}${prev.summary ?? ''}`,
      description: `${prev.description ?? ''}\n\n※ happ 側で予約が確認できなくなりました`.trim(),
    })
  }

  return { toInsert, toUpdate, toCancel, unchanged, conflicts }
}

// ---------- 同期本体 ----------

export async function runCalendarSync(
  orders: HappOrder[],
  opts: {
    kind: ReservationKind
    includeCustomerName: boolean
    dryRun: boolean
    client: CalendarClient | null
  },
): Promise<CalendarSyncResult> {
  const today   = new Date().toISOString().slice(0, 10)
  const targets = selectTargets(orders, today, opts.kind)

  const desired: CalendarEvent[] = []
  const fallbackOrderIds: number[] = []
  const skippedOrderIds:  number[] = []
  const noAreaOrderIds:   number[] = []
  for (const o of targets) {
    const built = buildEvent(o, opts.includeCustomerName, opts.kind)
    if (!built) { skippedOrderIds.push(o.orderId); continue }
    desired.push(built.event)
    if (built.usedFallback) fallbackOrderIds.push(o.orderId)
    if (!built.hasArea)     noAreaOrderIds.push(o.orderId)
  }

  const range = desired.length > 0
    ? {
        from: desired.reduce((a, b) => (a.start.dateTime < b.start.dateTime ? a : b)).start.dateTime.slice(0, 10),
        to:   desired.reduce((a, b) => (a.end.dateTime   > b.end.dateTime   ? a : b)).end.dateTime.slice(0, 10),
      }
    : null

  const base = {
    targetCount: targets.length,
    fallbackOrderIds, skippedOrderIds, noAreaOrderIds, range,
    kind: opts.kind,
  }

  if (!opts.client) {
    return {
      success: true, dryRun: true, ...base,
      inserted: desired.length, updated: 0, canceled: 0, unchanged: 0,
      conflicts: [], configured: false,
    }
  }

  try {
    const timeMin = `${today}T00:00:00Z`
    const timeMax = `${shiftDays(today, RECONCILE_FUTURE_DAYS)}T00:00:00Z`

    const existing = await opts.client.listOwnEvents(timeMin, timeMax)
    const plan     = buildPlan(desired, existing, today)

    const counts = {
      ...base,
      inserted:  plan.toInsert.length,
      updated:   plan.toUpdate.length,
      canceled:  plan.toCancel.length,
      unchanged: plan.unchanged,
      conflicts: plan.conflicts,
      configured: true,
    }

    if (opts.dryRun) return { success: true, dryRun: true, ...counts }

    // 逐次実行。insert / update しか呼ばない。
    for (const e of plan.toInsert) await opts.client.insertEvent(e)
    for (const e of plan.toUpdate) await opts.client.updateEvent(e)
    for (const e of plan.toCancel) await opts.client.updateEvent(e)

    return { success: true, dryRun: false, ...counts }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '同期に失敗しました' }
  }
}

// ---------- 仮予約の後始末 ----------

/**
 * 削除してよい仮予約イベントを選ぶ。次の全てを満たすものだけ。
 *   - このアプリ製（IDの形＋識別タグ）
 *   - 仮予約として作られた（種別タグ）
 *   - happ 側に対応する仮予約がもう無い
 *   - 今日以降（過去の予定は履歴として残す）
 */
export function selectPurgeable(
  existing: CalendarEvent[], desiredIds: Set<string>, today: string,
): CalendarEvent[] {
  return existing.filter(e =>
    isDeletableTentative(e) &&
    !desiredIds.has(e.id) &&
    (e.start?.dateTime?.slice(0, 10) ?? '') >= today,
  )
}

/**
 * 消えた仮予約のイベントを削除する。dryRun=true なら対象一覧を返すだけ。
 * 実際の DELETE はクライアント側でもう一度検証されるため、
 * 条件を満たさないものが渡っても削除されない（skipped に計上する）。
 */
export async function runTentativePurge(
  orders: HappOrder[],
  opts: { includeCustomerName: boolean; dryRun: boolean; client: CalendarClient },
): Promise<PurgeResult> {
  const today   = new Date().toISOString().slice(0, 10)
  const targets = selectTargets(orders, today, 'tentative')

  const desiredIds = new Set<string>()
  for (const o of targets) {
    const built = buildEvent(o, opts.includeCustomerName, 'tentative')
    if (built) desiredIds.add(built.event.id)
  }

  try {
    const timeMin = `${today}T00:00:00Z`
    const timeMax = `${shiftDays(today, RECONCILE_FUTURE_DAYS)}T00:00:00Z`

    const existing  = await opts.client.listOwnEvents(timeMin, timeMax)
    const purgeable = selectPurgeable(existing, desiredIds, today)

    const list: PurgeTarget[] = purgeable.map(e => ({
      id: e.id, summary: e.summary ?? '', startsAt: e.start?.dateTime ?? '',
    }))

    if (opts.dryRun) {
      return { success: true, dryRun: true, targets: list, deleted: 0, skipped: 0 }
    }

    let deleted = 0
    let skipped = 0
    for (const e of purgeable) {
      if (await opts.client.deleteTentativeEvent(e)) deleted++
      else skipped++
    }
    return { success: true, dryRun: false, targets: list, deleted, skipped }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '後始末に失敗しました' }
  }
}
