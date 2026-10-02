'use server'

import { revalidatePath } from 'next/cache'
import { savePrediction, savePredictionsBatch } from '../lib/repository/predictions'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export async function upsertPredictionAction(
  customerId:       string,
  targetMonth:      string,
  predictedVisits:  number,
  predictedRevenue: number,
  memo:             string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }
  if (!customerId)                                      return { success: false, error: '顧客IDが不正です' }
  if (!/^\d{4}-\d{2}$/.test(targetMonth))              return { success: false, error: '月の形式が不正です' }
  if (!Number.isFinite(predictedVisits) || predictedVisits < 0)   return { success: false, error: '予測来店回数が不正です' }
  if (!Number.isFinite(predictedRevenue) || predictedRevenue < 0) return { success: false, error: '予測売上が不正です' }

  try {
    await savePrediction({ customerId, targetMonth, predictedVisits, predictedRevenue, memo })
    revalidatePath('/predictions')
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}

export type BatchPredictionItem = {
  customerId:       string
  targetMonth:      string
  predictedVisits:  number
  predictedRevenue: number
  memo:             string
}

/** 複数の予測をまとめて保存する（「全て保存」ボタン用）。 */
export async function upsertPredictionsBatchAction(
  items: BatchPredictionItem[],
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: '保存対象がありません' }
  }
  for (const it of items) {
    if (!it.customerId)                          return { success: false, error: '顧客IDが不正です' }
    if (!/^\d{4}-\d{2}$/.test(it.targetMonth))   return { success: false, error: '月の形式が不正です' }
    if (!Number.isFinite(it.predictedRevenue) || it.predictedRevenue < 0) {
      return { success: false, error: `予測売上が不正です（${it.customerId}）` }
    }
  }

  try {
    await savePredictionsBatch(items)
    revalidatePath('/predictions')
    return { success: true, count: items.length }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}
