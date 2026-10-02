'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signupWithInviteAction } from '../actions/invite-codes'

export default function SignupForm({ initialCode }: { initialCode: string }) {
  const router = useRouter()
  const [code, setCode]         = useState(initialCode)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [done, setDone]         = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  const submit = () => {
    setError('')
    if (password !== confirm) { setError('パスワードが一致しません'); return }
    start(async () => {
      const r = await signupWithInviteAction(code, email, password)
      if (r.success) setDone(r.displayName)
      else setError(r.error)
    })
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-4xl">✓</p>
        <h2 className="text-lg font-bold text-slate-900">登録が完了しました</h2>
        <p className="text-sm text-slate-600">
          <strong>{done}</strong> さんとして登録されました。<br />
          設定したメールアドレスとパスワードでログインできます。
        </p>
        <button
          onClick={() => router.push('/login')}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
        >
          ログイン画面へ
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">アカウント登録</h1>
        <p className="text-sm text-slate-500 mt-1">
          お渡しした招待コードを入力してください
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">招待コード</label>
        <input
          type="text" value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          disabled={isPending}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base tracking-widest text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">メールアドレス</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          disabled={isPending} autoComplete="email" placeholder="example@email.com"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">パスワード（8文字以上）</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          disabled={isPending} autoComplete="new-password"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">パスワード（確認）</label>
        <input
          type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          disabled={isPending} autoComplete="new-password"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>

      <button
        onClick={submit}
        disabled={isPending || !code || !email || !password || !confirm}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '登録中...' : '登録する'}
      </button>

      <p className="text-xs text-slate-400 text-center">
        既にアカウントをお持ちの方は{' '}
        <a href="/login" className="text-blue-600 hover:underline">ログイン</a>
      </p>
    </div>
  )
}
