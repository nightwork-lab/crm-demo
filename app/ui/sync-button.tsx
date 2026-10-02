'use client'

import { useState, useTransition } from 'react'
import { syncHappAction, type SyncActionResult } from '../actions/sync-happ'

type Props = { isReadonly?: boolean }

export default function SyncButton({ isReadonly = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult]          = useState<SyncActionResult | null>(null)
  const [elapsed, setElapsed]        = useState<number | null>(null)

  const handleSync = () => {
    setResult(null)
    setElapsed(null)
    const start = Date.now()
    startTransition(async () => {
      const r = await syncHappAction()
      setResult(r)
      setElapsed(Math.round((Date.now() - start) / 1000))
    })
  }

  if (isReadonly) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">Vercel公開環境では happ 同期は実行できません。</p>
        <p className="mt-0.5 text-amber-700">同期は Mac のローカル環境で行ってください。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSync}
        disabled={isPending}
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors self-start ${
          isPending
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-800'
        }`}
      >
        {isPending ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            同期中...
          </>
        ) : (
          <>
            <span>↻</span>
            happ 同期
          </>
        )}
      </button>

      {result && !isPending && (
        result.success ? (
          <div className="text-sm space-y-1">
            <div className="font-semibold text-green-700">
              ✓ 同期完了
              {elapsed != null && (
                <span className="text-slate-600 font-normal ml-1">（{elapsed}秒）</span>
              )}
            </div>
            <div className="text-slate-700 font-medium">
              {new Date(result.syncedAt).toLocaleString('ja-JP')}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-700">
              <span>新規 <strong className="text-slate-900">{result.newCount}</strong>件</span>
              <span>更新 <strong className="text-slate-900">{result.updatedCount}</strong>件</span>
              <span>合計 <strong className="text-slate-900">{result.totalCount}</strong>件</span>
              <span>今後の予約 <strong className="text-slate-900">{result.upcomingCount}</strong>件</span>
            </div>
            {result.reconcileRemoved != null && result.reconcileRemoved > 0 && (
              <div className="text-xs text-amber-700">
                🗑 happ側で削除済みのオーダーを{result.reconcileRemoved}件除去
                {result.reconcileRemovedInfo && result.reconcileRemovedInfo.length > 0 && (
                  <span className="text-slate-500">（{result.reconcileRemovedInfo.join(' / ')}）</span>
                )}
              </div>
            )}
            {result.calendar && result.calendar.entries.some(e => e.ok || e.reason !== '未設定') && (
              <div className="text-xs">
                {result.calendar.entries
                  .filter(e => e.ok || e.reason !== '未設定')
                  .map(e => (
                    <div key={e.kind} className={e.ok ? 'text-blue-700' : 'text-amber-700'}>
                      📅 {e.kind === 'confirmed' ? '確定' : '仮予約'}:{' '}
                      {e.ok
                        ? `追加${e.inserted} / 更新${e.updated} / キャンセル表記${e.canceled} / 変更なし${e.unchanged}`
                        : `反映失敗 — ${e.reason}`}
                    </div>
                  ))}
              </div>
            )}
            {result.reconciledMonths && result.reconciledMonths.length > 1 && (
              <div className="text-xs text-blue-700">
                ↺ 同期が途切れていたため {result.reconciledMonths.join(' / ')} を遡って照合しました
              </div>
            )}
            {result.reconcileRemoved === null && (
              <div className="text-xs text-slate-400">
                ⚠ 当月照合はスキップされました（次回同期時に再試行）
              </div>
            )}
            {result.mirror && (
              <div className={`text-xs ${result.mirror.ok ? 'text-blue-700' : 'text-amber-700'}`}>
                {result.mirror.ok ? `⇅ Supabase: ${result.mirror.detail}` : `⇅ Supabase 反映失敗: ${result.mirror.detail}`}
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
