'use server'

import { revalidatePath } from 'next/cache'
import { updateCustomerFields } from '../lib/repository/customer-writes'
import { invalidateDataCache } from '../lib/cache'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export async function updateAlertExclusionAction(
  id: string,
  excluded: boolean,
  reason?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }

  try {
    await updateCustomerFields(id, {
      alertExcluded:      excluded ? true : undefined,
      alertExcludeReason: excluded ? (reason || undefined) : undefined,
    })

    invalidateDataCache()
    revalidatePath('/')
    revalidatePath('/alerts')
    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}
