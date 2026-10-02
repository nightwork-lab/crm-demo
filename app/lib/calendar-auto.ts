/**
 * happ 同期に連動して Google カレンダーへ自動反映する。
 *
 * 方針:
 * - **失敗しても happ 同期は成功扱い**にする。カレンダーは付随機能であり、
 *   ここで例外を投げて同期全体を失敗にしてはいけない（ミラーと同じ扱い）
 * - **削除は絶対に走らせない。** 消えた仮予約の後始末は、対象一覧を人が見てから
 *   実行する手動操作のまま据え置く
 * - 設定が無い環境では黙って何もしない（Google を使っていなくても同期は通る）
 * - 対象は「顧客名あり」の確定・仮予約のみ。顧客名なし版（外部共有用）は
 *   意図せず更新されると困るため自動化しない
 *
 * サーバー専用。
 */
import type { HappOrder } from './happ-order'
import { isCalendarSyncEnabled } from './app-mode'
import { loadGoogleConfig, CalendarClient, type ReservationKind } from './google-calendar'
import { runCalendarSync } from './calendar-sync'

/** 自動反映する対象。顧客名なし版は含めない。 */
const AUTO_KINDS: ReservationKind[] = ['confirmed', 'tentative']

export type CalendarAutoEntry = {
  kind: ReservationKind
  ok: boolean
  /** ok=true のときの反映内訳 */
  inserted?: number
  updated?: number
  canceled?: number
  unchanged?: number
  /** ok=false のときの理由。設定未完なら「未設定」を示す短い文言 */
  reason?: string
}

export type CalendarAutoResult = {
  /** 1つでも実際に書き込みを試みたか */
  ran: boolean
  entries: CalendarAutoEntry[]
}

/** 種別1つぶんを反映する。例外は投げず、必ず結果に畳み込む。 */
async function syncOne(orders: HappOrder[], kind: ReservationKind): Promise<CalendarAutoEntry> {
  const conf = loadGoogleConfig(kind, true)
  if (!conf.ok) {
    // 未設定はエラーではない。仮予約カレンダーだけ未設定という運用も許容する。
    return { kind, ok: false, reason: '未設定' }
  }

  try {
    const client = await CalendarClient.create(conf.config)
    const r = await runCalendarSync(orders, {
      kind,
      includeCustomerName: true,
      dryRun: false,
      client,
    })
    if (!r.success) return { kind, ok: false, reason: r.error }
    return {
      kind, ok: true,
      inserted: r.inserted, updated: r.updated,
      canceled: r.canceled, unchanged: r.unchanged,
    }
  } catch (e) {
    return { kind, ok: false, reason: e instanceof Error ? e.message : '不明なエラー' }
  }
}

/**
 * 確定・仮予約をまとめて反映する。
 * この関数は例外を投げない。呼び出し元は結果を表示するだけでよい。
 */
export async function runCalendarAutoSync(orders: HappOrder[]): Promise<CalendarAutoResult> {
  if (!isCalendarSyncEnabled()) return { ran: false, entries: [] }

  // Google 側のレート制限に触れないよう種別ごとに逐次実行する
  const entries: CalendarAutoEntry[] = []
  for (const kind of AUTO_KINDS) {
    entries.push(await syncOne(orders, kind))
  }

  return { ran: entries.some(e => e.ok), entries }
}
