'use server'

import { revalidatePath } from 'next/cache'
import { saveFollowUpStatus } from '../lib/repository/predictions'
import type { FollowUpStatus } from '../lib/prediction'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export async function setFollowUpStatusAction(
  customerId:  string,
  targetMonth: string,
  status:      FollowUpStatus,
): Promise<{ success: true; status: FollowUpStatus | null } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }
  if (!customerId)                          return { success: false, error: '顧客IDが不正です' }
  if (!/^\d{4}-\d{2}$/.test(targetMonth))   return { success: false, error: '月の形式が不正です' }
  if (status !== 'contacted' && status !== 'needs_contact') {
    return { success: false, error: '状態が不正です' }
  }

  try {
    const next = await saveFollowUpStatus(customerId, targetMonth, status)
    revalidatePath('/predictions')
    return { success: true, status: next }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '保存に失敗しました' }
  }
}
