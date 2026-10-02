'use client'

import { useState, useTransition } from 'react'
import {
  createInviteCodeAction, createInviteCodesBulkAction, revokeInviteCodeAction,
} from '../actions/invite-codes'
import type { InviteCode, BulkIssueResult, BulkIssueTarget } from '../lib/repository/invite-codes'

export default function InviteCodesPanel({
  codes, publicUrl,
}: { codes: InviteCode[]; publicUrl: string }) {
  const [name, setName]     = useState('')
  const [worker, setWorker] = useState('')
  const [issued, setIssued] = useState<{ code: string; name: string } | null>(null)
  const [error, setError]   = useState('')
  const [isPending, start]  = useTransition()

  const issue = () => {
    setError(''); setIssued(null)
    start(async () => {
      const r = await createInviteCodeAction(name, worker)
      if (r.success) {
        setIssued({ code: r.code, name })
        setName(''); setWorker('')
      } else setError(r.error)
    })
  }

  return (
    <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">招待コードを発行</h2>
        <p className="text-sm text-slate-600 mt-1">
          コードを渡すと、本人がメールアドレスとパスワードを設定して登録できます（14日間有効・1回限り）。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">表示名（源氏名）</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            disabled={isPending} placeholder="セラピスト名"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">happ番号（任意）</label>
          <input
            type="number" value={worker} onChange={(e) => setWorker(e.target.value)}
            disabled={isPending} placeholder="50"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <button
        onClick={issue} disabled={isPending || !name}
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '発行中...' : 'コードを発行'}
      </button>

      {error && <p className="text-sm text-red-600">✗ {error}</p>}

      {issued && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 space-y-2">
          <p className="text-sm font-bold text-green-800">
            {issued.name} さんの招待コードを発行しました
          </p>
          <p className="text-2xl font-mono font-bold tracking-widest text-center text-slate-900 bg-white rounded-lg py-3">
            {issued.code}
          </p>
          <p className="text-xs text-slate-600">以下を本人にお送りください：</p>
          <pre className="text-xs bg-white rounded-lg p-3 whitespace-pre-wrap break-all text-slate-700">
{`顧客管理アプリの登録のご案内です。

▼ 登録ページ
${publicUrl}/signup?code=${issued.code}

▼ 招待コード
${issued.code}

上記リンクを開き、メールアドレスと
パスワードを設定してください。
（14日以内にお願いします）`}
          </pre>
        </div>
      )}

      <BulkIssueForm />

      {codes.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <IssuedList codes={codes} publicUrl={publicUrl} />
        </div>
      )}
    </section>
  )
}

/** 複数人分をまとめて発行する。happ の一覧を貼り付けて使う。 */
function BulkIssueForm() {
  const [open, setOpen]   = useState(false)
  const [raw, setRaw]     = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<
    { issued: BulkIssueResult[]; skipped: BulkIssueTarget[]; publicUrl: string } | null
  >(null)
  const [copied, setCopied] = useState(false)
  const [isPending, start]  = useTransition()

  const submit = () => {
    setError(''); setResult(null); setCopied(false)
    start(async () => {
      const r = await createInviteCodesBulkAction(raw)
      if (r.success) setResult({ issued: r.issued, skipped: r.skipped, publicUrl: r.publicUrl })
      else setError(r.error)
    })
  }

  const buildText = () =>
    (result?.issued ?? [])
      .map((i) => `${i.displayName}\t${i.code}\t${result!.publicUrl}/signup?code=${i.code}`)
      .join('\n')

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* クリップボード不可の環境では下の表示から手動コピー */ }
  }

  return (
    <div className="pt-4 border-t border-slate-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-blue-700 hover:underline"
      >
        {open ? '▲ 一括発行を閉じる' : '▼ 複数人分をまとめて発行する'}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-600">
            happ のセラピスト一覧を貼り付けてください。<br />
            <strong>「名前 番号」を1行ずつ</strong>（タブ・カンマ・スペース区切り）。
            すでに登録済み・発行済みの方は自動でスキップされます。
          </p>
          <textarea
            value={raw} onChange={(e) => setRaw(e.target.value)}
            disabled={isPending} rows={6}
            placeholder={'セラピストA\t250\nセラピストB\t425\nセラピストC\t505'}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={submit} disabled={isPending || !raw.trim()}
            className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
          >
            {isPending ? '発行中...' : 'まとめて発行'}
          </button>

          {error && <p className="text-sm text-red-600">✗ {error}</p>}

          {result && (
            <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 space-y-2">
              <p className="text-sm font-bold text-green-800">
                {result.issued.length}件のコードを発行しました
                {result.skipped.length > 0 && (
                  <span className="text-slate-600 font-normal">
                    （{result.skipped.length}件はスキップ：登録済み or 発行済み）
                  </span>
                )}
              </p>
              {result.issued.length > 0 && (
                <>
                  <button
                    onClick={copyAll}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                  >
                    {copied ? '✓ コピーしました' : '一覧をコピー（名前・コード・URL）'}
                  </button>
                  <pre className="text-xs bg-white rounded-lg p-3 max-h-64 overflow-auto whitespace-pre text-slate-700">
{buildText()}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 発行済みコードの一覧。
 * 未使用・期限内のコードは「名前 / コード / 登録URL」をまとめてコピーできる。
 * （一括発行の直後だけでなく、後からでも配布用リストを取り出せるようにする）
 */
function IssuedList({ codes, publicUrl }: { codes: InviteCode[]; publicUrl: string }) {
  const [copied, setCopied] = useState(false)
  const [showText, setShowText] = useState(false)

  const active = codes.filter((c) => c.status === 'active')
  const text = active
    .map((c) => `${c.displayName}\t${c.code}\t${publicUrl}/signup?code=${c.code}`)
    .join('\n')

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShowText(true)   // クリップボード不可の環境では手動コピー用に表示
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-slate-700">
          発行済みコード（{codes.length}件／うち有効 {active.length}件）
        </p>
        {active.length > 0 && (
          <>
            <button
              onClick={copyAll}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
            >
              {copied ? '✓ コピーしました' : `有効な${active.length}件をコピー`}
            </button>
            <button
              onClick={() => setShowText((v) => !v)}
              className="text-xs text-slate-500 hover:underline"
            >
              {showText ? '一覧を隠す' : '一覧を表示'}
            </button>
          </>
        )}
      </div>

      {showText && (
        <textarea
          readOnly value={text} rows={10}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs font-mono"
        />
      )}

      <div className="space-y-1">
        {codes.map((c) => <CodeRow key={c.code} c={c} />)}
      </div>
    </div>
  )
}

function CodeRow({ c }: { c: InviteCode }) {
  const [isPending, start] = useTransition()
  const [gone, setGone]    = useState(false)
  if (gone) return null

  const badge =
    c.status === 'used'    ? <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5">使用済み</span> :
    c.status === 'expired' ? <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">期限切れ</span> :
                             <span className="text-xs rounded-full bg-green-100 text-green-700 px-2 py-0.5">有効</span>

  return (
    <div className="flex items-center gap-2 text-sm py-1.5">
      <span className="font-mono font-semibold text-slate-800">{c.code}</span>
      <span className="text-slate-600 truncate">{c.displayName}</span>
      {c.happWorkerId != null && <span className="text-xs text-slate-400">#{c.happWorkerId}</span>}
      {badge}
      {c.status === 'active' && (
        <button
          onClick={() => start(async () => { const r = await revokeInviteCodeAction(c.code); if (r.success) setGone(true) })}
          disabled={isPending}
          className="ml-auto text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          取り消す
        </button>
      )}
    </div>
  )
}
