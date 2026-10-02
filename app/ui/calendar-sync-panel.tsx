'use client'

import { useState, useTransition } from 'react'
import { syncCalendarAction, purgeTentativeAction } from '../actions/sync-calendar'
// 型は lib から直接取る。'use server' のファイルは型を再エクスポートできない。
import type { CalendarSyncResult, PurgeResult } from '../lib/calendar-sync'
import type { ReservationKind } from '../lib/google-calendar'

type Props = { disabled?: boolean }

function SyncResultView({ result }: { result: CalendarSyncResult }) {
  if (!result.success) {
    return <div className="text-sm font-semibold text-red-700">✗ {result.error}</div>
  }
  return (
    <div className="text-sm space-y-1">
      <div className={`font-semibold ${result.dryRun ? 'text-slate-900' : 'text-green-700'}`}>
        {result.dryRun ? '確認結果（書き込んでいません）' : '✓ 反映しました'}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-700">
        <span>対象 <strong className="text-slate-900">{result.targetCount}</strong>件</span>
        <span>追加 <strong className="text-slate-900">{result.inserted}</strong></span>
        <span>更新 <strong className="text-slate-900">{result.updated}</strong></span>
        <span>キャンセル表記 <strong className="text-slate-900">{result.canceled}</strong></span>
        <span>変更なし <strong className="text-slate-900">{result.unchanged}</strong></span>
      </div>
      {result.range && (
        <div className="text-slate-600">対象期間: {result.range.from} 〜 {result.range.to}</div>
      )}
      {result.noAreaOrderIds.length > 0 && (
        <div className="text-xs text-amber-700">
          ⚠ 利用エリア未取得のためコース名で表示: {result.noAreaOrderIds.length}件
          （happ 同期を1回実行すると入ります）
        </div>
      )}
      {result.fallbackOrderIds.length > 0 && (
        <div className="text-xs text-amber-700">
          ⚠ 終了時刻が空のため60分で作成: オーダー {result.fallbackOrderIds.join(', ')}
        </div>
      )}
      {result.skippedOrderIds.length > 0 && (
        <div className="text-xs text-red-700">
          ⚠ 開始時刻を解釈できず対象外: オーダー {result.skippedOrderIds.join(', ')}
        </div>
      )}
      {result.conflicts.length > 0 && (
        <div className="text-xs text-red-700">
          ⚠ このアプリ製と確認できないため触りませんでした: {result.conflicts.join(', ')}
        </div>
      )}
      {!result.configured && (
        <div className="space-y-1">
          {result.missingEnvKeys && result.missingEnvKeys.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">次の環境変数が読み取れていません</p>
              <ul className="mt-1 space-y-0.5">
                {result.missingEnvKeys.map(k => <li key={k}><code className="font-mono">{k}</code></li>)}
              </ul>
            </div>
          )}
          <div className="text-xs text-slate-500">
            設定が未完のため、既存予定とは照合していません。
          </div>
        </div>
      )}
    </div>
  )
}

function SyncSection({
  kind, title, note, includeName, disabled,
}: {
  kind: ReservationKind; title: string; note: string
  includeName: boolean; disabled: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<CalendarSyncResult | null>(null)

  const run = (dryRun: boolean) => {
    setResult(null)
    startTransition(async () => {
      setResult(await syncCalendarAction({ kind, includeCustomerName: includeName, dryRun }))
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-600 mt-0.5">{note}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(true)} disabled={isPending || disabled}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            isPending || disabled
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          確認（書き込まない）
        </button>
        <button
          onClick={() => run(false)} disabled={isPending || disabled}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            isPending || disabled
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-slate-900 text-white hover:bg-slate-700'
          }`}
        >
          {isPending
            ? <><span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />実行中...</>
            : <>📅 カレンダーに反映</>}
        </button>
      </div>
      {result && !isPending && <SyncResultView result={result} />}
    </div>
  )
}

function PurgeSection({ includeName, disabled }: { includeName: boolean; disabled: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<PurgeResult | null>(null)

  const run = (dryRun: boolean) => {
    setResult(null)
    startTransition(async () => {
      setResult(await purgeTentativeAction({ includeCustomerName: includeName, dryRun }))
    })
  }

  const targets = result?.success ? result.targets : []

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">消えた仮予約の後始末</h3>
        <p className="text-xs text-slate-600 mt-0.5">
          happ 側から無くなった仮予約の予定を削除します。
          <strong className="text-slate-900">仮予約として作られた予定だけ</strong>が対象で、
          確定予約・過去の予定・手で入れた予定は仕組み上削除できません。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(true)} disabled={isPending || disabled}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            isPending || disabled
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          対象を確認
        </button>
        {result?.success && result.dryRun && targets.length > 0 && (
          <button
            onClick={() => run(false)} disabled={isPending}
            className="rounded-xl px-3 py-2 text-sm font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors"
          >
            {targets.length}件を削除する
          </button>
        )}
      </div>

      {result && !isPending && (
        result.success ? (
          <div className="text-sm space-y-1">
            {result.dryRun ? (
              targets.length === 0
                ? <div className="text-slate-700">削除対象はありません。</div>
                : (
                  <>
                    <div className="font-semibold text-slate-900">
                      削除対象 {targets.length}件（まだ削除していません）
                    </div>
                    <ul className="text-xs text-slate-700 space-y-0.5">
                      {targets.map(t => (
                        <li key={t.id}>
                          {t.startsAt.replace('T', ' ').slice(0, 16)}　{t.summary}
                        </li>
                      ))}
                    </ul>
                  </>
                )
            ) : (
              <div className="font-semibold text-green-700">
                ✓ {result.deleted}件を削除しました
                {result.skipped > 0 && (
                  <span className="text-amber-700 font-normal ml-1">
                    （条件を満たさず見送り {result.skipped}件）
                  </span>
                )}
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

export default function CalendarSyncPanel({ disabled = false }: Props) {
  const [includeName, setIncludeName] = useState(true)

  if (disabled) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">この環境ではカレンダー同期が無効です</p>
        <p className="mt-0.5 text-amber-700">
          有効にするには環境変数に
          <code className="bg-white/60 px-1 py-0.5 rounded mx-1">CALENDAR_SYNC_ENABLED=true</code>
          と Google の認証情報を設定してください。ローカル環境では常に利用できます。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">イベントの表記</legend>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="include-name" checked={includeName}
                 onChange={() => setIncludeName(true)} className="mt-1" />
          <span className="text-sm">
            <span className="font-medium text-slate-900">顧客名あり</span>
            <span className="block text-slate-600">
              「○○ 新宿」。詳細欄に利用エリア・コース・金額・支払方法・オーダーIDが入ります。
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="include-name" checked={!includeName}
                 onChange={() => setIncludeName(false)} className="mt-1" />
          <span className="text-sm">
            <span className="font-medium text-slate-900">顧客名なし</span>
            <span className="block text-slate-600">
              エリアのみ。顧客名も金額も送りません。外部共有向け。
            </span>
          </span>
        </label>
      </fieldset>

      <SyncSection
        kind="confirmed" title="確定予約" includeName={includeName} disabled={false}
        note="キャンセル・仮予約を除いた今日以降の予約。削除は一切行いません。"
      />
      <SyncSection
        kind="tentative" title="仮予約" includeName={includeName} disabled={false}
        note="今日以降の仮予約。別カレンダーに、タイトル【仮】・Google の「未確定」状態で入ります。"
      />
      <PurgeSection includeName={includeName} disabled={false} />
    </div>
  )
}
