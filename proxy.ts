/**
 * 認証プロキシ（Next.js 16 の "Proxy" = 旧 Middleware）
 *
 * 1. デモ公開用の Basic 認証
 *    DEMO_BASIC_AUTH_USER と DEMO_BASIC_AUTH_PASS の両方が設定されている時だけ有効。
 *    片方だけ、または未設定なら何もしない（本番の Supabase Auth には影響しない）。
 * 2. Supabase Auth セッションを確認し、未ログインなら /login へリダイレクト。
 *    SUPABASE_URL / SUPABASE_ANON_KEY 未設定時はスキップ（開発時の安全策）。
 */

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const denied = checkDemoBasicAuth(req)
  if (denied) return denied

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

/**
 * デモ公開用の Basic 認証。
 * 認証情報が一致すれば null（通過）、不一致・未提示なら 401 を返す。
 * 環境変数が揃っていなければ常に null（機能オフ）。
 */
function checkDemoBasicAuth(req: NextRequest): NextResponse | null {
  const expectedUser = process.env.DEMO_BASIC_AUTH_USER
  const expectedPass = process.env.DEMO_BASIC_AUTH_PASS
  if (!expectedUser || !expectedPass) return null

  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    let decoded = ''
    try { decoded = atob(header.slice(6).trim()) } catch { decoded = '' }
    const sep  = decoded.indexOf(':')
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded
    const pass = sep >= 0 ? decoded.slice(sep + 1) : ''
    if (safeEqual(user, expectedUser) && safeEqual(pass, expectedPass)) return null
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="crm-demo", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  })
}

/** 入力の長さや内容で処理時間が変わらない比較（Node / Edge どちらでも動く） */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon-192\\.png|manifest\\.json|manifest\\.webmanifest|api/).*)',
  ],
}
