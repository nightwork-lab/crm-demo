'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { upsertPredictionAction } from '../actions/upsert-prediction'
import { setFollowUpStatusAction } from '../actions/set-followup-status'
import { setPredictionExcludeAction } from '../actions/set-prediction-exclude'
import { usePredictionBatch } from './prediction-batch-context'

/** 数値入力欄でホイールスクロールしても値が変わらないようにする。 */
function blurOnWheel(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur()
}

type FollowUpStatus = 'contacted' | 'needs_contact'

export type PredictionRowProps = {
  customerId:       string
  customerName:     string
  targetMonth:      string
  lastMonthVisits:  number
  lastMonthRevenue: number
  actualVisits:     number
  actualRevenue:    number
  predictedVisits:  number | null
  predictedRevenue: number | null
  existingMemo:     string
  hasPrediction:    boolean
  isReadonly:       boolean
  lastVisitDate?:   string | null  // "YYYY/MM/DD HH:mm"
  tags?:            string[]
  followUpStatus?:  FollowUpStatus | null
}

/** フォロー状況ボタン（対応済み / 要連絡）の共通フック。 */
function useFollowUp(
  customerId: string,
  targetMonth: string,
  initial: FollowUpStatus | null | undefined,
) {
  const [status, setStatus]          = useState<FollowUpStatus | null>(initial ?? null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setStatus(initial ?? null) }, [initial])

  const toggle = (next: FollowUpStatus) => {
    // 楽観的更新（同じものを押したら解除）
    const optimistic = status === next ? null : next
    setStatus(optimistic)
    startTransition(async () => {
      const r = await setFollowUpStatusAction(customerId, targetMonth, next)
      if (r.success) setStatus(r.status)
    })
  }

  return { status, isPending, toggle }
}

function formatLastVisit(dt: string | null | undefined): { date: string; daysAgo: string | null } {
  if (!dt) return { date: '来店なし', daysAgo: null }
  const datePart = dt.slice(0, 10)  // "YYYY/MM/DD"
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = datePart.split('/').map(Number)
  const visitDate = new Date(y, m - 1, d)
  const days = Math.round((today.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24))
  const daysAgo = days === 0 ? '今日' : days > 0 ? `${days}日前` : `${Math.abs(days)}日後`
  return { date: datePart, daysAgo }
}

/** 予測リストからの除外メニュー（恒久 / 一時）。 */
function ExcludeMenu({ customerId, isReadonly, size = 'sm' }: {
  customerId: string
  isReadonly: boolean
  size?: 'sm' | 'lg'
}) {
  const [open, setOpen]              = useState(false)
  const [isPending, startTransition] = useTransition()
  const [done, setDone]              = useState(false)

  const exclude = (kind: 'permanent' | 'temporary') => {
    startTransition(async () => {
      const r = await setPredictionExcludeAction(customerId, kind)
      if (r.success) setDone(true)
    })
  }

  if (done) {
    return <span className="text-xs text-slate-400 italic whitespace-nowrap">除外しました</span>
  }

  // モバイル（lg）: 全幅のインライン展開
  if (size === 'lg') {
    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          disabled={isReadonly || isPending}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          予測から除外
        </button>
      )
    }
    return (
      <div className="flex flex-col gap-1.5">
        <button onClick={() => exclude('permanent')} disabled={isPending}
          className="rounded-lg bg-slate-700 text-white py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
          もう来なそう（除外）
        </button>
        <button onClick={() => exclude('temporary')} disabled={isPending}
          className="rounded-lg bg-amber-500 text-white py-2 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
          一時的に除外
        </button>
        <button onClick={() => setOpen(false)} disabled={isPending}
          className="rounded-lg border border-slate-300 bg-white py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50">
          やめる
        </button>
      </div>
    )
  }

  // テーブル（sm）: ⋯ アイコン + 絶対配置ドロップダウン（行の高さを変えない）
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isReadonly || isPending}
        title="予測から除外"
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 leading-none"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
            <button onClick={() => exclude('permanent')} disabled={isPending}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              もう来なそう
            </button>
            <button onClick={() => exclude('temporary')} disabled={isPending}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              一時的に除外
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** 対応済み / 要連絡 のトグルボタン。size で余白を変える。 */
function FollowUpButtons({
  status, isPending, toggle, isReadonly, size = 'sm',
}: {
  status:     FollowUpStatus | null
  isPending:  boolean
  toggle:     (s: FollowUpStatus) => void
  isReadonly: boolean
  size?:      'sm' | 'lg' | 'compact'
}) {
  // compact: テーブル用に短いラベル（済/要）。lg: モバイル用に全幅。
  const compact = size === 'compact'
  const pad =
    size === 'lg'      ? 'px-3 py-2 text-sm flex-1' :
    size === 'compact' ? 'px-2 py-1 text-xs' :
                         'px-2 py-1 text-xs'
  const contactedLabel = compact ? '済' : `${status === 'contacted' ? '✓ ' : ''}今月対応済み`
  const needsLabel     = compact ? '要' : `${status === 'needs_contact' ? '✓ ' : ''}要連絡`
  return (
    <div className="flex gap-1">
      <button
        onClick={() => toggle('contacted')}
        disabled={isReadonly || isPending}
        title="今月対応済み"
        className={`rounded-lg font-semibold border transition-colors disabled:opacity-50 whitespace-nowrap ${pad} ${
          status === 'contacted'
            ? 'bg-green-600 text-white border-green-600'
            : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
        }`}
      >
        {contactedLabel}
      </button>
      <button
        onClick={() => toggle('needs_contact')}
        disabled={isReadonly || isPending}
        title="要連絡"
        className={`rounded-lg font-semibold border transition-colors disabled:opacity-50 whitespace-nowrap ${pad} ${
          status === 'needs_contact'
            ? 'bg-red-600 text-white border-red-600'
            : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
        }`}
      >
        {needsLabel}
      </button>
    </div>
  )
}

/** 行・カードの色分け用：状態に応じた背景クラス。 */
function statusRowClass(status: FollowUpStatus | null): string {
  if (status === 'contacted')     return 'bg-green-50/50'
  if (status === 'needs_contact') return 'bg-red-50/50'
  return ''
}

function TagBadges({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null
  const visible = tags.slice(0, 3)
  const overflow = tags.length - 3
  return (
    <span className="flex flex-wrap gap-1 mt-0.5">
      {visible.map((tag) => (
        <span key={tag} className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 leading-none">
          {tag}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-slate-400 leading-none self-center">+{overflow}</span>
      )}
    </span>
  )
}

function useRowState({
  customerId,
  targetMonth,
  existingMemo,
  predictedVisits,
  predictedRevenue,
  actualRevenue,
  lastMonthRevenue,
}: Pick<PredictionRowProps, 'customerId' | 'targetMonth' | 'existingMemo' | 'predictedVisits' | 'predictedRevenue' | 'actualRevenue' | 'lastMonthRevenue'>,
  viewKey: 'table' | 'card') {
  const [revenue, setRevenue]         = useState(predictedRevenue != null ? String(predictedRevenue) : '')
  const [error, setError]             = useState('')
  const [saved, setSaved]             = useState(false)
  const [isPending, startTransition]  = useTransition()
  const batch = usePredictionBatch()

  useEffect(() => {
    setRevenue(predictedRevenue != null ? String(predictedRevenue) : '')
    setSaved(false)
  }, [predictedRevenue])

  // 入力値を親へ報告（「全て保存」用）。元の値から変わって有効な数値のときだけ dirty。
  useEffect(() => {
    if (!batch.enabled) return
    const original = predictedRevenue != null ? String(predictedRevenue) : ''
    const r = parseFloat(revenue)
    const isDirty = revenue !== original && revenue !== '' && Number.isFinite(r) && r >= 0
    // ビューごとに別キー（table/card の二重マウントで互いを打ち消さないため）
    batch.report(`${viewKey}:${customerId}`, isDirty
      ? { customerId, targetMonth, predictedVisits: predictedVisits ?? 0, predictedRevenue: r, memo: existingMemo }
      : null)
  }, [revenue, batch.enabled, batch.report, viewKey, customerId, targetMonth, predictedVisits, predictedRevenue, existingMemo])

  const canCopyLastMonth = lastMonthRevenue > 0

  const copyLastMonth = () => {
    setRevenue(String(lastMonthRevenue))
    setSaved(false)
    setError('')
  }

  const handleSave = () => {
    const r = parseFloat(revenue)
    if (!Number.isFinite(r) || r < 0) { setError('予測売上を確認してください'); return }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await upsertPredictionAction(
        customerId,
        targetMonth,
        predictedVisits ?? 0,
        r,
        existingMemo,
      )
      if (result.success) {
        setSaved(true)
      } else {
        setError(result.error)
      }
    })
  }

  const parsedRevenue = parseFloat(revenue)
  const diff = revenue !== '' && Number.isFinite(parsedRevenue)
    ? actualRevenue - parsedRevenue
    : null

  return { revenue, setRevenue, error, saved, setSaved, isPending, handleSave, diff, copyLastMonth, canCopyLastMonth }
}

export function PredictionTableRow(props: PredictionRowProps) {
  const {
    customerId, customerName,
    lastMonthVisits, lastMonthRevenue,
    actualVisits, actualRevenue,
    hasPrediction, isReadonly, lastVisitDate, tags,
  } = props
  const { revenue, setRevenue, error, saved, setSaved, isPending, handleSave, diff, copyLastMonth, canCopyLastMonth } = useRowState(props, 'table')
  const followUp = useFollowUp(customerId, props.targetMonth, props.followUpStatus)
  const lastVisit = formatLastVisit(lastVisitDate)

  const rowBg = statusRowClass(followUp.status) || (!hasPrediction && !saved ? 'bg-orange-50/40' : '')

  return (
    <tr className={`border-t border-slate-200 hover:bg-slate-50 ${rowBg}`}>
      <td className="px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <Link href={`/customers/${customerId}`} className="font-semibold text-blue-700 hover:underline text-sm whitespace-nowrap">
            {customerName}
          </Link>
          {!hasPrediction && !saved && (
            <span className="text-xs text-orange-600 font-medium whitespace-nowrap">未入力</span>
          )}
        </div>
        <TagBadges tags={tags} />
      </td>
      <td className="px-4 py-2.5 text-right text-xs">
        {lastVisit.daysAgo === null ? (
          <span className="text-slate-400">来店なし</span>
        ) : (
          <>
            <span className="text-slate-700 block">{lastVisit.date}</span>
            <span className="text-slate-400">{lastVisit.daysAgo}</span>
          </>
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-sm text-slate-700 whitespace-nowrap">{lastMonthVisits}回</td>
      <td className="px-4 py-2.5 text-right text-sm text-slate-700 whitespace-nowrap">¥{lastMonthRevenue.toLocaleString()}</td>
      <td className="px-4 py-2.5 text-right text-sm text-slate-700 whitespace-nowrap">{actualVisits}回</td>
      <td className="px-4 py-2.5 text-right text-sm text-slate-700 whitespace-nowrap">¥{actualRevenue.toLocaleString()}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          step="1000"
          value={revenue}
          onChange={(e) => { setRevenue(e.target.value); setSaved(false) }}
          onWheel={blurOnWheel}
          disabled={isReadonly || isPending}
          placeholder="円"
          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
        />
      </td>
      <td className={`px-4 py-2.5 text-right text-sm font-semibold ${
        diff == null ? 'text-slate-400' : diff >= 0 ? 'text-green-700' : 'text-red-700'
      }`}>
        {diff == null ? '—' : diff >= 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`}
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex justify-center">
          <FollowUpButtons
            status={followUp.status}
            isPending={followUp.isPending}
            toggle={followUp.toggle}
            isReadonly={isReadonly}
            size="compact"
          />
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center justify-end gap-1.5">
          {canCopyLastMonth && (
            <button
              onClick={copyLastMonth}
              disabled={isReadonly || isPending}
              title="先月実績をコピー"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              先月
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isReadonly || isPending || revenue === ''}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            {isPending ? '…' : saved ? '✓' : '保存'}
          </button>
          <ExcludeMenu customerId={customerId} isReadonly={isReadonly} />
        </div>
        {error && <p className="text-xs text-red-600 text-right mt-1">{error}</p>}
      </td>
    </tr>
  )
}

export function PredictionCard(props: PredictionRowProps) {
  const {
    customerId, customerName,
    lastMonthVisits, lastMonthRevenue,
    actualVisits, actualRevenue,
    hasPrediction, isReadonly, lastVisitDate, tags,
  } = props
  const { revenue, setRevenue, error, saved, setSaved, isPending, handleSave, diff, copyLastMonth, canCopyLastMonth } = useRowState(props, 'card')
  const followUp = useFollowUp(customerId, props.targetMonth, props.followUpStatus)
  const lastVisit = formatLastVisit(lastVisitDate)

  const cardBorder =
    followUp.status === 'contacted'     ? 'border-green-300 bg-green-50' :
    followUp.status === 'needs_contact' ? 'border-red-300 bg-red-50' :
    !hasPrediction && !saved            ? 'border-orange-200 bg-orange-50' :
                                          'border-slate-200 bg-white'

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${cardBorder}`}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center flex-wrap gap-2">
            <Link href={`/customers/${customerId}`} className="font-bold text-slate-900 hover:underline">
              {customerName}
            </Link>
            {!hasPrediction && !saved && (
              <span className="text-xs font-semibold text-orange-600 bg-orange-100 rounded-full px-2 py-0.5">予測未入力</span>
            )}
            {saved && (
              <span className="text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">保存済み ✓</span>
            )}
          </div>
          <TagBadges tags={tags} />
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">最終来店</p>
          {lastVisit.daysAgo === null ? (
            <p className="text-xs font-semibold text-slate-400">来店なし</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-700">{lastVisit.date}</p>
              <p className="text-xs text-slate-400">{lastVisit.daysAgo}</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-slate-500">先月来店</p>
          <p className="font-semibold text-slate-900">{lastMonthVisits}回</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">先月利用金額</p>
          <p className="font-semibold text-slate-900">¥{lastMonthRevenue.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">今月実績来店</p>
          <p className="font-semibold text-slate-900">{actualVisits}回</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">今月実績売上</p>
          <p className="font-semibold text-slate-900">¥{actualRevenue.toLocaleString()}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700 mb-1.5">今月のフォロー状況</p>
        <FollowUpButtons
          status={followUp.status}
          isPending={followUp.isPending}
          toggle={followUp.toggle}
          isReadonly={isReadonly}
          size="lg"
        />
      </div>

      {canCopyLastMonth && (
        <button
          onClick={copyLastMonth}
          disabled={isReadonly || isPending}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          先月実績をコピー（¥{lastMonthRevenue.toLocaleString()}）
        </button>
      )}

      <div>
        <label className="text-xs font-semibold text-slate-700 block mb-1">今月予測売上（円）</label>
        <input
          type="number"
          min="0"
          step="1000"
          value={revenue}
          onChange={(e) => { setRevenue(e.target.value); setSaved(false) }}
          onWheel={blurOnWheel}
          disabled={isReadonly || isPending}
          placeholder="例: 30000"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>

      {diff != null && (
        <p className={`text-sm font-semibold ${diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          差分: {diff >= 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`}
        </p>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      {isReadonly && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          閲覧専用モードのため保存できません
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={isReadonly || isPending || revenue === ''}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '保存中...' : '保存する'}
      </button>

      <ExcludeMenu customerId={customerId} isReadonly={isReadonly} size="lg" />
    </div>
  )
}

/**
 * モバイル用のコンパクト行（案A）。1行に予測入力とフォロー状況を並べ、
 * 参考情報（先月実績・最終来店など）はタップで展開する。
 * 保存は画面下部の「全て保存」バーで行うため、行ごとの保存ボタンは持たない。
 */
export function PredictionCompactRow(props: PredictionRowProps) {
  const {
    customerId, customerName,
    lastMonthVisits, lastMonthRevenue,
    actualVisits, actualRevenue,
    hasPrediction, isReadonly, lastVisitDate, tags,
  } = props
  const { revenue, setRevenue, setSaved, isPending, diff, copyLastMonth, canCopyLastMonth } = useRowState(props, 'card')
  const followUp  = useFollowUp(customerId, props.targetMonth, props.followUpStatus)
  const lastVisit = formatLastVisit(lastVisitDate)
  const [expanded, setExpanded] = useState(false)

  const rowBg =
    followUp.status === 'contacted'     ? 'border-green-300 bg-green-50' :
    followUp.status === 'needs_contact' ? 'border-red-300 bg-red-50' :
    !hasPrediction                      ? 'border-orange-200 bg-orange-50/60' :
                                          'border-slate-200 bg-white'

  return (
    <div className={`rounded-xl border ${rowBg}`}>
      {/* ヘッダー行：顧客名（タップで展開）＋ フォロー状況 */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <span className="text-slate-400 text-xs w-3 shrink-0">{expanded ? '▼' : '▸'}</span>
          <span className="font-bold text-slate-900 truncate">{customerName}</span>
          {!hasPrediction && (
            <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 rounded px-1.5 py-0.5 shrink-0">未</span>
          )}
        </button>
        <FollowUpButtons
          status={followUp.status}
          isPending={followUp.isPending}
          toggle={followUp.toggle}
          isReadonly={isReadonly}
          size="compact"
        />
      </div>

      {/* 入力行：予測入力 ＋ 実績 ＋ 差分 */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-1.5">
        <input
          type="number" min="0" step="1000" inputMode="numeric"
          value={revenue}
          onChange={(e) => { setRevenue(e.target.value); setSaved(false) }}
          onWheel={blurOnWheel}
          disabled={isReadonly || isPending}
          placeholder="予測売上"
          className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <div className="text-right text-xs shrink-0 w-20">
          <p className="text-slate-400 leading-none mb-0.5">実績</p>
          <p className="font-semibold text-slate-700 leading-none">¥{actualRevenue.toLocaleString()}</p>
        </div>
        <div className={`text-right text-xs shrink-0 w-16 font-semibold ${
          diff == null ? 'text-slate-300' : diff >= 0 ? 'text-green-700' : 'text-red-700'
        }`}>
          {diff == null ? '—' : diff >= 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`}
        </div>
      </div>

      {/* 展開：参考情報と操作 */}
      {expanded && (
        <div className="border-t border-slate-200/70 px-3 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><p className="text-xs text-slate-500">先月来店</p><p className="font-semibold text-slate-900">{lastMonthVisits}回</p></div>
            <div><p className="text-xs text-slate-500">先月利用金額</p><p className="font-semibold text-slate-900">¥{lastMonthRevenue.toLocaleString()}</p></div>
            <div><p className="text-xs text-slate-500">今月実績来店</p><p className="font-semibold text-slate-900">{actualVisits}回</p></div>
            <div>
              <p className="text-xs text-slate-500">最終来店</p>
              {lastVisit.daysAgo === null
                ? <p className="font-semibold text-slate-400">来店なし</p>
                : <p className="font-semibold text-slate-700">{lastVisit.date}<span className="text-slate-400 font-normal ml-1">{lastVisit.daysAgo}</span></p>}
            </div>
          </div>
          <TagBadges tags={tags} />
          <div className="flex items-center gap-2">
            {canCopyLastMonth && (
              <button
                onClick={copyLastMonth}
                disabled={isReadonly || isPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                先月コピー（¥{lastMonthRevenue.toLocaleString()}）
              </button>
            )}
            <div className="ml-auto"><ExcludeMenu customerId={customerId} isReadonly={isReadonly} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
