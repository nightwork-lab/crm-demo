'use server'

import { getOrdersFile } from '../lib/repository'
import type { HappOrder } from '../lib/happ-order'
import { isCalendarSyncEnabled, CALENDAR_DISABLED_MESSAGE } from '../lib/app-mode'
import { hasDevAccess } from '../lib/auth-context'
import { loadGoogleConfig, CalendarClient, type ReservationKind } from '../lib/google-calendar'
import {
  runCalendarSync, runTentativePurge,
  type CalendarSyncResult, type PurgeResult,
} from '../lib/calendar-sync'

// 'use server' のファイルから型を再エクスポートしないこと。
// export type { ... } は実行時に値として参照され module evaluation で ReferenceError になる。
// 呼び出し側は ../lib/calendar-sync から直接 import する。

/** 共通の事前チェック。権限・モード・オーダー取得をまとめる。 */
async function prepare(): Promise<
  { ok: true; orders: HappOrder[] } | { ok: false; error: string }
> {
  if (!(await hasDevAccess()))   return { ok: false, error: '権限がありません' }
  if (!isCalendarSyncEnabled()) return { ok: false, error: CALENDAR_DISABLED_MESSAGE }
  const happData = await getOrdersFile()
  return { ok: true, orders: happData?.orders ?? [] }
}

/**
 * 予約を Google カレンダーへ一括反映する Server Action。開発者限定。
 *
 * kind='confirmed' は確定予約、'tentative' は仮予約。書き込み先は別カレンダー。
 * dryRun=true のときは書き込まず、件数だけ返す。この経路では何も削除しない。
 */
export async function syncCalendarAction(
  opts: { kind: ReservationKind; includeCustomerName: boolean; dryRun: boolean },
): Promise<CalendarSyncResult> {
  const pre = await prepare()
  if (!pre.ok) return { success: false, error: pre.error }

  const conf = loadGoogleConfig(opts.kind, opts.includeCustomerName)

  // 設定未完でも、対象件数と不足キー名は返す（値は返さない）
  if (!conf.ok) {
    if (!opts.dryRun) {
      return { success: false, error: `未設定の環境変数があります: ${conf.missing.join(', ')}` }
    }
    const result = await runCalendarSync(pre.orders, { ...opts, dryRun: true, client: null })
    return result.success ? { ...result, missingEnvKeys: conf.missing } : result
  }

  let client: CalendarClient
  try {
    client = await CalendarClient.create(conf.config)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '認証に失敗しました' }
  }

  return runCalendarSync(pre.orders, { ...opts, client })
}

/**
 * happ 側から消えた仮予約のイベントを削除する Server Action。開発者限定。
 *
 * **仮予約カレンダーの、仮予約として作られたイベントだけ**が対象。
 * 確定予約・過去の予定・手で入れた予定は、クライアント側の再検証で弾かれる。
 * dryRun=true なら対象一覧を返すだけで削除しない。
 */
export async function purgeTentativeAction(
  opts: { includeCustomerName: boolean; dryRun: boolean },
): Promise<PurgeResult> {
  const pre = await prepare()
  if (!pre.ok) return { success: false, error: pre.error }

  const conf = loadGoogleConfig('tentative', opts.includeCustomerName)
  if (!conf.ok) {
    return { success: false, error: `未設定の環境変数があります: ${conf.missing.join(', ')}` }
  }

  let client: CalendarClient
  try {
    client = await CalendarClient.create(conf.config)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '認証に失敗しました' }
  }

  return runTentativePurge(pre.orders, { ...opts, client })
}
