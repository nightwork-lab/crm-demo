'use server'

import { revalidatePath } from 'next/cache'
import { saveLink, removeLink } from '../lib/repository/customer-writes'
import { invalidateDataCache } from '../lib/cache'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export type LinkActionResult = { success: true } | { success: false; error: string }

/** happ customerId と CRM customer.id を紐付ける。 */
export async function linkCustomerAction(
  happCustomerId: number,
  crmCustomerId: string,
  customerName: string,
): Promise<LinkActionResult> {
  if (!Number.isInteger(happCustomerId) || happCustomerId < 0) {
    return { success: false, error: '無効な happ 顧客IDです' }
  }
  if (!crmCustomerId || typeof crmCustomerId !== 'string' || crmCustomerId.trim() === '') {
    return { success: false, error: 'CRM 顧客を選択してください' }
  }
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }

  try {
    await saveLink(happCustomerId, crmCustomerId.trim(), `画面操作で紐付け: ${customerName}`)
    invalidateDataCache()
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}

/** 既存の紐付けを解除する。 */
export async function unlinkCustomerAction(
  happCustomerId: number,
): Promise<LinkActionResult> {
  if (!Number.isInteger(happCustomerId) || happCustomerId < 0) {
    return { success: false, error: '無効な happ 顧客IDです' }
  }
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }

  try {
    await removeLink(happCustomerId)
    invalidateDataCache()
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '解除に失敗しました',
    }
  }
}
