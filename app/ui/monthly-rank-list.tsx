'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

export type RankRow = {
  customerId:       string
  customerName:     string
  revenue:          number
  visits:           number
  avgAmount:        number
  predictedRevenue: number | null
  diff:             number | null
  /** この月が初回来店（初指名）の顧客 */
  isFirstDesignation: boolean
}

type Props = {
  rows:        RankRow[]
  targetMonth: string
}

type SortBy = 'revenue' | 'visits'

export default function MonthlyRankList({ rows, targetMonth }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('revenue')

  const sorted = useMemo(() =>
    [...rows]
      .sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.visits - a.visits)
      .slice(0, 10),
    [rows, sortBy],
  )

  const maxRevenue = Math.max(...sorted.map((r) => r.revenue), 1)
  const maxVisits  = Math.max(...sorted.map((r) => r.visits),  1)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-slate-900">
          顧客別ランキング
          <span className="text-sm font-normal text-slate-500 ml-1">TOP{sorted.length}</span>
        </h2>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
          <button
            onClick={() => setSortBy('revenue')}
            className={`px-3 py-1.5 transition-colors ${
              sortBy === 'revenue' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            売上順
          </button>
          <button
            onClick={() => setSortBy('visits')}
            className={`px-3 py-1.5 transition-colors ${
              sortBy === 'visits' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            来店数順
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">この月の来店データがありません</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((row, i) => {
            const barPct = sortBy === 'revenue'
              ? (row.revenue / maxRevenue) * 100
              : (row.visits  / maxVisits)  * 100
            const rankColor =
              i === 0 ? 'text-amber-500 font-black' :
              i === 1 ? 'text-slate-400 font-black' :
              i === 2 ? 'text-amber-700 font-black' :
                        'text-slate-400 font-bold'

            return (
              <div key={row.customerId}>
                <div className="flex items-center gap-2">
                  <span className={`w-5 text-xs text-right shrink-0 ${rankColor}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="text-sm font-semibold text-blue-700 hover:underline truncate"
                        >
                          {row.customerName}
                        </Link>
                        {row.isFirstDesignation && (
                          <span className="shrink-0 rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                            初
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 text-sm">
                        <span className="font-bold text-slate-900">¥{row.revenue.toLocaleString()}</span>
                        <span className="text-slate-500 text-xs">{row.visits}回</span>
                        {row.avgAmount > 0 && (
                          <span className="text-slate-400 text-xs">
                            avg ¥{row.avgAmount.toLocaleString()}
                          </span>
                        )}
                        {row.diff != null && (
                          <span className={`text-xs font-semibold ${row.diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {row.diff >= 0
                              ? `+¥${row.diff.toLocaleString()}`
                              : `-¥${Math.abs(row.diff).toLocaleString()}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sortBy === 'revenue' ? 'bg-blue-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100">
        <Link
          href={`/predictions?month=${targetMonth}`}
          className="text-sm text-blue-700 hover:underline font-medium"
        >
          → 来店予測ページで予測を入力する
        </Link>
      </div>
    </div>
  )
}
