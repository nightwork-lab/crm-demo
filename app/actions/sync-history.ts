'use server'

import { revalidatePath } from 'next/cache'
import { invalidateDataCache } from '../lib/cache'
import { isReadonlyMode, SYNC_READONLY_MESSAGE } from '../lib/app-mode'
import { runHistorySync } from '../lib/happ-history-runner'
import type { HistorySyncResult } from '../lib/happ-history'
import { autoCommitAndPush, type AutoPushResult } from '../lib/git-autopush'
import { mirrorToSupabase, type MirrorResult } from '../lib/supabase-mirror'

export type HistorySyncActionResult =
  | { success: true;  result: HistorySyncResult; autoPush?: AutoPushResult; mirror?: MirrorResult }
  | { success: false; error: string }

export async function syncHistoryAction(
  year: number,
  month: number,
): Promise<HistorySyncActionResult> {
  if (isReadonlyMode()) return { success: false, error: SYNC_READONLY_MESSAGE }

  try {
    const result = await runHistorySync(year, month)
    invalidateDataCache()
    revalidatePath('/')
    const [mirror, autoPush] = await Promise.all([
      mirrorToSupabase(),
      autoCommitAndPush(`${year}年${month}月履歴`),
    ])
    return { success: true, result, autoPush, mirror }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
