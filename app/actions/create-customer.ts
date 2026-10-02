'use server'

import { revalidatePath } from 'next/cache'
import { createCustomerWithLink } from '../lib/repository/customer-writes'
import { invalidateDataCache } from '../lib/cache'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export type CreateCustomerInput = {
  name: string
  memo: string
  tags: string           // カンマ区切り文字列。保存時に配列に変換
  happCustomerId: number // 登録と同時に紐付ける happ 顧客 ID
  // 電話番号は個人情報最小化の観点から収集しない
}

export type CreateCustomerResult =
  | { success: true;  crmCustomerId: string }
  | { success: false; error: string }

/** 顧客を新規作成し、happ customerId と紐付ける。 */
export async function createCustomerAction(
  input: CreateCustomerInput,
): Promise<CreateCustomerResult> {
  const name = input.name.trim()
  if (!name) return { success: false, error: '顧客名は必須です' }

  if (!Number.isInteger(input.happCustomerId) || input.happCustomerId < 0) {
    return { success: false, error: '無効な happ 顧客IDです' }
  }
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }

  try {
    const tags = input.tags.split(',').map((t) => t.trim()).filter(Boolean)
    const crmCustomerId = await createCustomerWithLink({
      name,
      memo: input.memo.trim(),
      tags: tags.length > 0 ? tags : undefined,
      happCustomerId: input.happCustomerId,
    })

    invalidateDataCache()
    revalidatePath('/')
    revalidatePath('/customers')

    return { success: true, crmCustomerId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}
