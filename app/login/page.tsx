import { loginAction } from './actions'

type Props = { searchParams: Promise<{ error?: string }> }

const ERROR_MESSAGES: Record<string, string> = {
  empty:   'メールアドレスとパスワードを入力してください',
  config:  'Supabase Auth が未設定です。管理者にお問い合わせください',
  invalid: 'メールアドレスまたはパスワードが正しくありません',
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ログイン</h1>
          <p className="text-sm text-slate-500 mt-1">顧客管理 CRM</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {ERROR_MESSAGES[error] ?? 'ログインに失敗しました'}
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              パスワード
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            ログイン
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center">
          ※ 現在はBasic認証でのアクセスが必要です
        </p>
      </div>
    </div>
  )
}
