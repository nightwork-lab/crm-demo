/**
 * 認証プロキシ（Next.js 16 の "Proxy" = 旧 Middleware）
 *
 * Supabase Auth セッションを確認し、未ログインなら /login へリダイレクト。
 * SUPABASE_URL / SUPABASE_ANON_KEY 未設定時はスキップ（開発時の安全策）。
 */

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const url     = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  // Supabase 未設定の場合はそのまま通過
  if (!url || !anonKey) return NextResponse.next()

  const response = NextResponse.next({ request: req })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll:  () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // getSession はクッキーのトークンをローカルで読むだけで、通常は認証サーバーへの
  // ネットワーク往復が発生しない（期限切れ時のみリフレッシュで1往復）。
  // ここは「未ログインをログイン画面へ誘導する」UX目的のチェックであり、
  // 本人確認の正典はデータ層（セッションクライアント + RLS + getUser）にある。
  // 以前の getUser() は全リクエストで認証サーバーへ往復しており、全ページの
  // 表示に約100〜300ms を上乗せしていた。
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  const path = req.nextUrl.pathname
  // 未ログインでもアクセスできるページ（ログイン・招待コードでの新規登録）
  const isPublicPage = path === '/login' || path === '/signup'

  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon-192\\.png|manifest\\.json|manifest\\.webmanifest|api/).*)',
  ],
}
