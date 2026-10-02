'use server'

import { revalidatePath } from 'next/cache'
import { updateCustomerFields } from '../lib/repository/customer-writes'
import { invalidateDataCache } from '../lib/cache'
import { isWriteBlocked, READONLY_MESSAGE } from '../lib/app-mode'

export async function updateCustomerAction(
  id: string,
  name: string,
  tagsRaw: string,
  memo: string,
  birthday?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (isWriteBlocked()) return { success: false, error: READONLY_MESSAGE }
  const trimmedName = name.trim()
  if (!trimmedName) return { success: false, error: '顧客名は必須です' }
  if (trimmedName.length > 100) return { success: false, error: '顧客名は100文字以内で入力してください' }
  if (memo.length > 2000) return { success: false, error: 'メモは2000文字以内で入力してください' }

  const trimmedBirthday = birthday?.trim() || undefined
  if (trimmedBirthday && !/^(\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/.test(trimmedBirthday)) {
    return { success: false, error: '誕生日はMM-DDまたはYYYY-MM-DD形式で入力してください' }
  }

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  try {
    await updateCustomerFields(id, {
      name: trimmedName,
      tags,
      memo,
      birthday: trimmedBirthday,
    })

    invalidateDataCache()
    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)
    revalidatePath('/anniversaries')

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '保存に失敗しました',
    }
  }
}
