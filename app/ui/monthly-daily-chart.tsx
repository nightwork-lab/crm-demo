'use client'

import { useState } from 'react'

export type DayData = {
  date:   string
  amount: number
  visits: number
}

type Props = {
  data: DayData[]
}

export default function MonthlyDailyChart({ data }: Props) {
  const [mode, setMode]         = useState<'amount' | 'visits'>('amount')
  const [selected, setSelected] = useState<DayData | null>(null)

  const maxAmount = Math.max(...data.map((d) => d.amount), 1)
  const maxVisits = Math.max(...data.map((d) => d.visits), 1)
  const maxValue  = mode === 'amount' ? maxAmount : maxVisits

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-slate-900">
          {mode === 'amount' ? '日別売上推移' : '日別来店数推移'}
        </h2>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
          <button
            onClick={() => { setMode('amount'); setSelected(null) }}
            className={`px-3 py-1.5 transition-colors ${
              mode === 'amount' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            売上
          </button>
          <button
            onClick={() => { setMode('visits'); setSelected(null) }}
            className={`px-3 py-1.5 transition-colors ${
              mode === 'visits' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            来店数
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">この月のデータがありません</p>
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <div className="flex items-end gap-px h-36 min-w-0 w-full">
              {data.map((d) => {
                const v    = mode === 'amount' ? d.amount : d.visits
                const pct  = maxValue > 0 ? (v / maxValue) * 100 : 0
                const day  = parseInt(d.date.split('-')[2], 10)
                const isSel = selected?.date === d.date
                const showLabel = day === 1 || day % 5 === 0

                return (
                  <div
                    key={d.date}
                    className="flex flex-col items-center justify-end flex-1 min-w-[7px] max-w-[28px] cursor-pointer"
                    onClick={() => setSelected(isSel ? null : d)}
                  >
                    <div className="w-full flex flex-col justify-end" style={{ height: '112px' }}>
                      <div
                        className={`w-full rounded-t transition-colors ${
                          isSel
                            ? 'bg-blue-700'
                            : mode === 'amount'
                              ? 'bg-blue-400 hover:bg-blue-500'
                              : 'bg-emerald-400 hover:bg-emerald-500'
                        }`}
                        style={{ height: `${Math.max(pct, v > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className={`text-[9px] mt-0.5 ${showLabel ? 'text-slate-500' : 'text-transparent'}`}>
                      {day}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {selected ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-slate-500">日付</p>
                <p className="font-semibold text-slate-900">{selected.date}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">売上</p>
                <p className="font-bold text-slate-900">¥{selected.amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">来店数</p>
                <p className="font-bold text-slate-900">{selected.visits}件</p>
              </div>
              {selected.visits > 0 && (
                <div>
                  <p className="text-xs text-slate-500">平均単価</p>
                  <p className="font-bold text-slate-900">
                    ¥{Math.round(selected.amount / selected.visits).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center">バーをタップして詳細を表示</p>
          )}
        </>
      )}
    </div>
  )
}
