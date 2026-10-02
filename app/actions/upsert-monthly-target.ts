'use server'

import { revalidatePath } from 'next/cache'
import { saveTarget } from '../lib/repository/monthly-targets'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export async function upsertMonthlyTargetAction(
  targetMonth:   string,
  targetRevenue: number,
): Promise<{ success: true } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) return { success: false, error: '月の形式が不正です' }
  if (!Number.isFinite(targetRevenue) || targetRevenue <= 0) {
    return { success: false, error: '目標売上は1以上の数値を入力してください' }
  }
  try {
    await saveTarget({ targetMonth, targetRevenue })
    revalidatePath('/predictions')
    revalidatePath('/monthly-summary')
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}
