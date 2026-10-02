'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { prevMonthKey, nextMonthKey, formatMonthLabel } from '../lib/prediction-utils'

type Props = {
  currentMonth: string  // "YYYY-MM"
  basePath:     string  // e.g. "/predictions"
  /** 選択可能な最古の年（既定 2022 = 開業年） */
  minYear?:     number
}

export default function MonthNav({ currentMonth, basePath, minYear = 2022 }: Props) {
  const router    = useRouter()
  const [isPending, startTransition] = useTransition()
  const today     = new Date().toISOString().slice(0, 7)
  const lastMonth = prevMonthKey(today, 1)
  const thisYear  = new Date().getFullYear()

  const [curY, curM] = currentMonth.split('-').map(Number)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickYear, setPickYear]     = useState(curY)

  const go = (month: string) => {
    setPickerOpen(false)
    startTransition(() => router.push(`${basePath}?month=${month}`))
  }

  const years  = Array.from({ length: thisYear - minYear + 1 }, (_, i) => thisYear - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="space-y-2">
      {/* 行1: [← 前月] [月ラベル(タップで選択)] [翌月 →] */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => go(prevMonthKey(currentMonth))}
          disabled={isPending}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-colors min-w-[72px] shrink-0"
        >
          ← 前月
        </button>
        <button
          onClick={() => { setPickYear(curY); setPickerOpen((v) => !v) }}
          disabled={isPending}
          className="flex-1 text-center text-base font-bold text-slate-900 rounded-lg py-1.5 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 transition-colors"
          title="タップして年月を選択"
        >
          {formatMonthLabel(currentMonth)}
          <span className="text-slate-400 text-xs ml-1">{pickerOpen ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={() => go(nextMonthKey(currentMonth))}
          disabled={isPending}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-colors min-w-[72px] shrink-0"
        >
          翌月 →
        </button>
      </div>

      {/* 年月ピッカー（月ラベルのタップで開閉） */}
      {pickerOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
          {/* 年の選択 */}
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setPickYear(y)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  pickYear === y
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {y}年
              </button>
            ))}
          </div>
          {/* 月の選択 */}
          <div className="grid grid-cols-6 gap-1.5">
            {months.map((m) => {
              const key      = `${pickYear}-${String(m).padStart(2, '0')}`
              const isCur    = key === currentMonth
              const isFuture = key > today
              return (
                <button
                  key={m}
                  onClick={() => go(key)}
                  disabled={isFuture || isPending}
                  className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                    isCur
                      ? 'bg-slate-800 text-white'
                      : isFuture
                        ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                        : 'bg-slate-100 text-slate-700 hover:bg-blue-100 active:bg-blue-200'
                  }`}
                >
                  {m}月
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 行2: クイックジャンプ */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => go(today)}
          disabled={isPending}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            currentMonth === today
              ? 'bg-slate-800 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          今月
        </button>
        <button
          onClick={() => go(lastMonth)}
          disabled={isPending}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            currentMonth === lastMonth
              ? 'bg-slate-800 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          先月
        </button>
        <button
          onClick={() => go(prevMonthKey(today, 12))}
          disabled={isPending}
          className="rounded-full px-4 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          1年前
        </button>
        {isPending && <span className="text-xs text-slate-400">読み込み中...</span>}
      </div>
    </div>
  )
}
