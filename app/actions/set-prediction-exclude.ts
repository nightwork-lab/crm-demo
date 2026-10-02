'use server'

import { revalidatePath } from 'next/cache'
import { updateCustomerFields } from '../lib/repository/customer-writes'
import { invalidateDataCache } from '../lib/cache'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export type PredictionExclude = 'permanent' | 'temporary'

/**
 * 来店予測リストからの除外状態を設定する。
 * exclude=null で除外解除（リストへ戻す）。
 */
export async function setPredictionExcludeAction(
  id:      string,
  exclude: PredictionExclude | null,
): Promise<{ success: true } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }
  if (exclude !== null && exclude !== 'permanent' && exclude !== 'temporary') {
    return { success: false, error: '除外区分が不正です' }
  }

  try {
    await updateCustomerFields(id, { predictionExclude: exclude ?? undefined })

    invalidateDataCache()
    revalidatePath('/predictions')
    revalidatePath(`/customers/${id}`)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}
