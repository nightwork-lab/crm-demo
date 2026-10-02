'use client'

import { useState, useTransition } from 'react'
import { syncHistoryAction, type HistorySyncActionResult } from '../actions/sync-history'

type Props = { isReadonly?: boolean }

export default function HistorySyncButton({ isReadonly = false }: Props) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [result, setResult] = useState<HistorySyncActionResult | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSync = () => {
    setResult(null)
    setElapsed(null)
    const start = Date.now()
    startTransition(async () => {
      const r = await syncHistoryAction(year, month)
      setResult(r)
      setElapsed(Math.round((Date.now() - start) / 1000))
    })
  }

  if (isReadonly) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">Vercel公開環境では履歴同期は実行できません。</p>
        <p className="mt-0.5 text-amber-700">同期は Mac のローカル環境で行ってください。</p>
      </div>
    )
  }

  const years  = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          disabled={isPending}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {years.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          disabled={isPending}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {months.map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        <button
          onClick={handleSync}
          disabled={isPending}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            isPending
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900'
          }`}
        >
          {isPending ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              取得中...（1〜2分かかります）
            </>
          ) : (
            <>📅 履歴取得</>
          )}
        </button>
      </div>

      {result && !isPending && (
        result.success ? (
          <div className="text-sm space-y-1">
            <div className="font-semibold text-green-700">
              ✓ {result.result.year}年{result.result.month}月 取得完了
              {elapsed != null && <span className="text-slate-600 font-normal ml-1">（{elapsed}秒）</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-700">
              <span>稼働日 <strong className="text-slate-900">{result.result.activeDays}</strong>日</span>
              <span>取得 <strong className="text-slate-900">{result.result.fetched}</strong>件</span>
              <span>新規追加 <strong className="text-slate-900">{result.result.added}</strong>件</span>
              <span>合計 <strong className="text-slate-900">{result.result.totalSaved}</strong>件</span>
            </div>
            {result.result.removed > 0 && (
              <div className="text-xs text-amber-700">
                🗑 happ側で削除済みのオーダーを{result.result.removed}件除去
                （{result.result.removedInfo.join(' / ')}）
              </div>
            )}
            {result.result.errors.length > 0 && (
              <div className="text-red-700 text-xs">
                ⚠ エラー {result.result.errors.length}件: {result.result.errors.join(', ')}
              </div>
            )}
            {result.autoPush && (
              <div className={`text-xs ${result.autoPush.pushed ? 'text-blue-700' : 'text-slate-500'}`}>
                {result.autoPush.pushed
                  ? `☁︎ ${result.autoPush.message}`
                  : `☁︎ 本番未反映: ${result.autoPush.reason}`}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm font-semibold text-red-700">✗ {result.error}</div>
        )
      )}
    </div>
  )
}
