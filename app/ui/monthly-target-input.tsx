'use client'

import { useState, useTransition, useEffect } from 'react'
import { upsertMonthlyTargetAction } from '../actions/upsert-monthly-target'

type Props = {
  targetMonth:   string
  currentTarget: number | null
  isReadonly:    boolean
}

export default function MonthlyTargetInput({ targetMonth, currentTarget, isReadonly }: Props) {
  const [isEditing, setIsEditing]     = useState(currentTarget == null)
  const [value, setValue]             = useState(currentTarget != null ? String(currentTarget) : '')
  const [error, setError]             = useState('')
  const [saved, setSaved]             = useState(false)
  const [isPending, startTransition]  = useTransition()

  useEffect(() => {
    setValue(currentTarget != null ? String(currentTarget) : '')
    setIsEditing(currentTarget == null)
    setSaved(false)
  }, [currentTarget, targetMonth])

  const handleSave = () => {
    const v = parseFloat(value)
    if (!Number.isFinite(v) || v <= 0) { setError('金額を正しく入力してください'); return }
    setError('')
    startTransition(async () => {
      const result = await upsertMonthlyTargetAction(targetMonth, v)
      if (result.success) {
        setSaved(true)
        setIsEditing(false)
      } else {
        setError(result.error)
      }
    })
  }

  if (!isEditing && currentTarget != null) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-slate-900">
            ¥{currentTarget.toLocaleString()}
          </p>
          {saved && <span className="text-xs text-green-700 font-semibold">保存済み ✓</span>}
        </div>
        {!isReadonly && (
          <button
            onClick={() => { setIsEditing(true); setSaved(false) }}
            className="text-sm text-blue-700 hover:underline font-medium shrink-0"
          >
            変更
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          step="10000"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          disabled={isReadonly || isPending}
          placeholder="例: 500000"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <button
          onClick={handleSave}
          disabled={isReadonly || isPending || value === ''}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {isPending ? '保存中...' : '保存'}
        </button>
        {currentTarget != null && (
          <button
            onClick={() => { setIsEditing(false); setError('') }}
            disabled={isPending}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            キャンセル
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700 font-semibold">{error}</p>}
      {isReadonly && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          閲覧専用モードのため保存できません
        </p>
      )}
    </div>
  )
}
