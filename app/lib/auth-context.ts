/**
 * ログイン中のセラピスト情報を取得するユーティリティ。Server Component / Server Action 専用。
 *
 * therapists テーブルが未作成の場合も null / false を返して既存ページを壊さない。
 * 例外でアプリ全体を落とさないよう、全関数が try/catch で保護されている。
 */
import { cache } from 'react'
import { createSupabaseSessionClient } from './supabase-server'

export type TherapistRole = 'admin' | 'therapist'

export type TherapistInfo = {
  id:          string
  displayName: string
  role:        TherapistRole
  active:      boolean
  /** 開発者（アプリ提供側）のアカウントか。運営・セラピストには常に false。 */
  isDeveloper: boolean
}

/** therapists の取得対象列。is_developer は未適用環境を考慮して別扱いにする。 */
const BASE_COLUMNS = 'id, display_name, role, active'

type TherapistRow = {
  id:            string
  display_name:  string
  role:          string
  active:        boolean
  is_developer?: boolean | null
}

/**
 * ログイン中の Supabase Auth ユーザーを返す。未ログイン・設定未完は null。
 * cache() によりリクエスト内で1回だけ認証サーバーへ問い合わせる
 * （各リポジトリが毎回呼ぶため、素のままだと1ページ描画で5〜6往復発生する）。
 */
export const getCurrentUser = cache(async () => {
  try {
    const supabase = await createSupabaseSessionClient()
    if (!supabase) return null
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
})

/** ログイン中のユーザー ID（= therapists.id）を返す。未ログインは null。 */
export async function getCurrentTherapistId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user?.id ?? null
}

/**
 * therapists テーブルからセラピスト情報を返す。
 * テーブル未作成・未ログイン・設定未完はいずれも null を返す。
 * cache() によりリクエスト内1回に抑え、認証確認は getCurrentUser を共用する。
 */
export const getCurrentTherapist = cache(async (): Promise<TherapistInfo | null> => {
  try {
    const user = await getCurrentUser()
    if (!user) return null

    const supabase = await createSupabaseSessionClient()
    if (!supabase) return null

    const primary = await supabase
      .from('therapists')
      .select(BASE_COLUMNS + ', is_developer')
      .eq('id', user.id)
      .maybeSingle()

    let row = primary.data as TherapistRow | null

    // is_developer 列が未作成（マイグレーション未適用）の環境でも
    // 管理者判定まで巻き添えで落とさないよう、列なしで引き直す。
    if (primary.error) {
      const fallback = await supabase
        .from('therapists')
        .select(BASE_COLUMNS)
        .eq('id', user.id)
        .maybeSingle()
      if (fallback.error) return null
      row = fallback.data as TherapistRow | null
    }

    if (!row) return null
    return {
      id:          String(row.id),
      displayName: String(row.display_name),
      role:        row.role as TherapistRole,
      active:      Boolean(row.active),
      isDeveloper: Boolean(row.is_developer),
    }
  } catch {
    return null
  }
})

/** 現在のユーザーが管理者かどうかを返す。未ログイン・テーブル未作成は false。 */
export async function isAdmin(): Promise<boolean> {
  try {
    const therapist = await getCurrentTherapist()
    return therapist?.role === 'admin' && therapist?.active === true
  } catch {
    return false
  }
}

/**
 * JWT の payload から sub（ユーザーID）を取り出す。**署名検証はしない。**
 * 表示制御にしか使わないため、改ざんされていても実害はない
 * （ページ / Server Action のガードは getUser() で本人確認する）。
 */
function subFromJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = Buffer.from(
      payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64',
    ).toString('utf8')
    return (JSON.parse(json) as { sub?: string }).sub ?? null
  } catch {
    return null
  }
}

/**
 * ナビ表示用の軽量判定。**権限の正典ではない。**
 *
 * getSession() は Cookie をローカルで読むだけなので認証サーバーへの往復が発生しない。
 * 全ページのレイアウトから呼ばれるため、ここで getUser() を使ってはいけない
 * （proxy.ts のコメントのとおり、全リクエストで 100〜300ms を上乗せしてしまう）。
 *
 * Cookie 改ざんでメニュー項目が出うるが、実害はない。
 * ページ / Server Action のガードには必ず hasDevAccess() を使うこと。
 */
export const hasDevAccessForNav = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createSupabaseSessionClient()
    if (!supabase) return false

    const { data: { session } } = await supabase.auth.getSession()
    // session.user を読むと supabase-js が「insecure」警告をログに出す。
    // ここは表示制御専用で正典ではないため、トークンの sub を直接見て警告を避ける。
    const userId = session?.access_token ? subFromJwt(session.access_token) : null
    if (!userId) return false

    // is_developer 列が未作成なら error になり false が返る（＝非表示）。それが望ましい既定値。
    const { data, error } = await supabase
      .from('therapists')
      .select('active, is_developer')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return false

    const row = data as { active?: boolean; is_developer?: boolean | null }
    return row.is_developer === true && row.active === true
  } catch {
    return false
  }
})

/**
 * 現在のユーザーが開発者（アプリ提供側）かどうかを返す。**権限判定の正典。**
 * 未ログイン・テーブル未作成・is_developer 列未作成はいずれも false。
 * 管理者（運営）とは別軸であり、isAdmin() の判定には影響しない。
 *
 * getUser() 経由で認証サーバーに問い合わせるため、レイアウトなど
 * 全ページで走る場所からは呼ばないこと（表示制御は hasDevAccessForNav）。
 */
export async function hasDevAccess(): Promise<boolean> {
  try {
    const therapist = await getCurrentTherapist()
    return therapist?.isDeveloper === true && therapist?.active === true
  } catch {
    return false
  }
}
