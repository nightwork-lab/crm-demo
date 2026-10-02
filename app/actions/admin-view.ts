'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAdmin } from '../lib/auth-context'
import { VIEW_AS_COOKIE } from '../lib/admin-view'
import { getDataSource } from '../lib/data-source'
import { invalidateDataCache } from '../lib/cache'

/** 指定従業員の閲覧モードを開始する（管理者のみ・Supabase モード限定）。 */
export async function startViewAsAction(therapistId: string): Promise<void> {
  if (!(await isAdmin())) redirect('/')
  if (!therapistId) redirect('/admin')
  // JSON モード（ローカル）では表示データが切り替わらず誤解を招くため開始不可
  if (getDataSource() !== 'supabase') redirect('/admin')

  const store = await cookies()
  store.set(VIEW_AS_COOKIE, therapistId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 2,  // 2時間で自動解除（切り忘れ対策）
  })
  invalidateDataCache()
  redirect('/')
}

/** 閲覧モードを終了する。 */
export async function endViewAsAction(): Promise<void> {
  const store = await cookies()
  store.delete(VIEW_AS_COOKIE)
  invalidateDataCache()
  redirect('/admin')
}
