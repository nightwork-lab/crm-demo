/**
 * サーバー専用 Supabase クライアント。Client Component から絶対にインポートしないこと。
 *
 * createSupabaseServerClient()  : service_role_key 版。RLS をバイパス。同期・データ投入専用。
 * createSupabaseSessionClient() : SUPABASE_ANON_KEY + セッション Cookie 版。RLS が適用される。
 *                                 SUPABASE_URL または SUPABASE_ANON_KEY 未設定時は null を返す。
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`環境変数 ${key} が設定されていません`)
  return value
}

/** service_role 版（RLS バイパス）。同期・データ投入専用。 */
export function createSupabaseServerClient() {
  const url     = getRequiredEnv('SUPABASE_URL')
  const roleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, roleKey, {
    auth: { persistSession: false },
  })
}

/**
 * セッション Cookie 版（RLS 適用）。認証済みユーザーの権限で動作する。
 * SUPABASE_URL または SUPABASE_ANON_KEY が未設定の場合は null を返す。
 * Server Component / Server Action 専用。
 */
export async function createSupabaseSessionClient() {
  const url     = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll:  () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component からは Cookie を書けない。Server Action / Route Handler のみ可。
        }
      },
    },
  })
}
