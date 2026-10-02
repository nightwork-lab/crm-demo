'use server'

import { revalidatePath } from 'next/cache'
import { runHappSync, type SyncResult } from '../lib/happ-sync'
import { runHistorySync } from '../lib/happ-history-runner'
import { invalidateDataCache } from '../lib/cache'
import { isReadonlyMode, SYNC_READONLY_MESSAGE } from '../lib/app-mode'
import { autoCommitAndPush, type AutoPushResult } from '../lib/git-autopush'
import { mirrorToSupabase, type MirrorResult } from '../lib/supabase-mirror'
import { getOrdersFile } from '../lib/repository'
import { monthsToReconcile, formatSyncMonth } from '../lib/sync-months'
import { runCalendarAutoSync, type CalendarAutoResult } from '../lib/calendar-auto'
import { hasDevAccess } from '../lib/auth-context'

export type SyncActionResult = SyncResult & {
  autoPush?: AutoPushResult
  /** 照合で happ 側から消えていたため自動削除した件数（照合失敗時は null） */
  reconcileRemoved?: number | null
  reconcileRemovedInfo?: string[]
  /** 実際に照合した月（"2026/08" 形式）。通常は当月1件のみ */
  reconciledMonths?: string[]
  /** Supabase への反映結果 */
  mirror?: MirrorResult
  /** Google カレンダーへの自動反映結果。未設定・無効なら entries は空 */
  calendar?: CalendarAutoResult
}

/**
 * ダッシュボードの「happ 同期」ボタンから呼ばれる Server Action。
 * 1. orderList / orderListCash の通常同期
 * 2. 前回同期の月〜今月の uriageTherapist 照合（happ 側で削除されたオーダーの自動削除）
 * 3. data/*.json を自動コミット・プッシュして本番へ反映
 * 4. Google カレンダーへの自動反映（開発者のみ・失敗しても同期は成功扱い）
 */
export async function syncHappAction(): Promise<SyncActionResult> {
  if (isReadonlyMode()) return { success: false, error: SYNC_READONLY_MESSAGE }

  // 照合範囲の判定に使うため、同期で上書きされる前の最終同期日を控えておく
  const previous = await getOrdersFile()
  const previousSyncedAt = previous?.lastSyncedAt ?? null

  const result = await runHappSync()

  if (!result.success) return result

  // 照合（失敗しても同期自体は成功扱い。削除は照合成功時のみ行われる）。
  // 当月だけでなく「前回同期の月〜今月」を対象にする。月をまたいで同期が
  // 途切れると、当月照合だけでは前月の取りこぼしが永久に残るため。
  let reconcileRemoved: number | null = null
  const reconcileRemovedInfo: string[] = []
  const reconciledMonths: string[] = []
  try {
    let removed = 0
    for (const m of monthsToReconcile(previousSyncedAt, new Date())) {
      const rec = await runHistorySync(m.year, m.month)
      removed += rec.removed
      reconcileRemovedInfo.push(...rec.removedInfo)
      reconciledMonths.push(formatSyncMonth(m))
    }
    reconcileRemoved = removed
  } catch {
    reconcileRemoved = null
  }

  invalidateDataCache()
  revalidatePath('/')

  // Supabase ミラー（本番のセラピスト別表示用）と git 自動プッシュを実行
  const [mirror, autoPush] = await Promise.all([
    mirrorToSupabase(),
    autoCommitAndPush('happ同期'),
  ])

  // Google カレンダーへ自動反映。カレンダーは開発者個人のものなので権限を確認する。
  // 例外は runCalendarAutoSync 側で畳み込まれるため、ここで同期が失敗することはない。
  // 削除は行わない（消えた仮予約の後始末は手動のまま）。
  let calendar: CalendarAutoResult | undefined
  if (await hasDevAccess()) {
    const fresh = await getOrdersFile()
    calendar = await runCalendarAutoSync(fresh?.orders ?? [])
  }

  return {
    ...result, autoPush, reconcileRemoved, reconcileRemovedInfo, reconciledMonths, mirror, calendar,
  }
}
