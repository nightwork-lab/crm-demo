/**
 * 管理者の「従業員として閲覧」状態の管理。
 *
 * - Cookie に閲覧対象の therapist_id を保持する
 * - 有効なのは管理者のみ（非管理者が Cookie を偽造しても RLS により
 *   他人のデータは返らないため、安全性は RLS が担保する）
 * - 閲覧モード中は全ての書き込みをブロックする（read-only）
 * server side 専用。
 */
import { cookies } from 'next/headers'
import { cache } from 'react'
import { isAdmin } from './auth-context'
import { createSupabaseSessionClient } from './supabase-server'

export const VIEW_AS_COOKIE = 'admin_view_as'

export type AdminViewAs = {
  therapistId: string
  displayName: string
}

/** 閲覧モード中なら対象従業員を返す。通常時・非管理者は null。 */
export const getAdminViewAs = cache(async (): Promise<AdminViewAs | null> => {
  try {
    const store = await cookies()
    const id = store.get(VIEW_AS_COOKIE)?.value
    if (!id) return null
    if (!(await isAdmin())) return null

    const supabase = await createSupabaseSessionClient()
    if (!supabase) return null
    const { data } = await supabase
      .from('therapists')
      .select('display_name')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null

    return { therapistId: id, displayName: String(data.display_name) }
  } catch {
    return null
  }
})

/** 閲覧モード中の therapist_id（フィルタ用）。通常時は null。 */
export async function getViewAsTherapistId(): Promise<string | null> {
  const view = await getAdminViewAs()
  return view?.therapistId ?? null
}

/**
 * データ取得のスコープとなる therapist_id。
 * 閲覧モード中 → 対象従業員 / 通常時 → ログイン中の本人。
 * 管理者は RLS 上は全員分を読めるが、通常ページでは自分のデータに限定する
 * （複数従業員のデータが混ざって表示されるのを防ぐ）。
 */
export async function getScopedTherapistId(): Promise<string | null> {
  const viewAs = await getViewAsTherapistId()
  if (viewAs) return viewAs
  const { getCurrentTherapistId } = await import('./auth-context')
  return getCurrentTherapistId()
}

/** 閲覧モード中なら例外を投げる（書き込み系の共通ガード）。 */
export async function assertNotViewingAs(): Promise<void> {
  if (await getViewAsTherapistId()) {
    throw new Error('閲覧モード中は保存できません（読み取り専用です）')
  }
}
