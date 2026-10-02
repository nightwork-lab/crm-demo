'use client'

import { useState, useTransition } from 'react'
import type { Customer } from '../lib/data'
import { updateAlertExclusionAction } from '../actions/update-alert-exclusion'

const PRESET_REASONS = ['卒業', '長期来店なし', '営業対象外', 'トラブル回避', 'その他']

type Props = { customer: Customer; isReadonly?: boolean }

export default function AlertExclusionPanel({ customer, isReadonly = false }: Props) {
  const [isExpanded, setIsExpanded]     = useState(false)
  const [reason, setReason]             = useState('')
  const [customReason, setCustomReason] = useState('')
  const [isPending, startTransition]    = useTransition()

  const excluded = customer.alertExcluded === true

  const handleExclude = () => {
    const finalReason = reason === 'その他' ? customReason.trim() : reason
    startTransition(async () => {
      await updateAlertExclusionAction(customer.id, true, finalReason || undefined)
      setIsExpanded(false)
      setReason('')
      setCustomReason('')
    })
  }

  const handleUnexclude = () => {
    startTransition(async () => {
      await updateAlertExclusionAction(customer.id, false)
    })
  }

  if (isReadonly) {
    return (
      <span className="text-xs text-slate-400">
        {excluded ? `アラート除外中${customer.alertExcludeReason ? `（${customer.alertExcludeReason}）` : ''}` : 'アラート除外（閲覧専用）'}
      </span>
    )
  }

  if (excluded) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
          <span className="text-sm font-semibold text-slate-600">アラート除外中</span>
          {customer.alertExcludeReason && (
            <span className="text-xs text-slate-500">（{customer.alertExcludeReason}）</span>
          )}
        </div>
        <button
          onClick={handleUnexclude}
          disabled={isPending}
          className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
        >
          {isPending ? '解除中...' : '除外を解除'}
        </button>
      </div>
    )
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="text-sm font-medium text-slate-500 hover:text-slate-700 underline"
      >
        来店アラートから除外する
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-700">除外理由を選択</p>

      <div className="flex flex-wrap gap-2">
        {PRESET_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => { setReason(r); if (r !== 'その他') setCustomReason('') }}
            disabled={isPending}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              reason === r
                ? 'bg-slate-700 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {reason === 'その他' && (
        <input
          type="text"
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          placeholder="理由を入力..."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={handleExclude}
          disabled={isPending || !reason || (reason === 'その他' && !customReason.trim())}
          className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? '保存中...' : '除外する'}
        </button>
        <button
          onClick={() => { setIsExpanded(false); setReason(''); setCustomReason('') }}
          disabled={isPending}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
