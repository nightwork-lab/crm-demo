'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setPredictionExcludeAction } from '../actions/set-prediction-exclude'
import type { PredictionRowData } from './prediction-sort-list'

type Props = {
  rows:       PredictionRowData[]
  isReadonly: boolean
}

function ExcludedRow({ row, isReadonly }: { row: PredictionRowData; isReadonly: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [removed, setRemoved] = useState(false)

  const restore = () => {
    startTransition(async () => {
      const r = await setPredictionExcludeAction(row.customerId, null)
      if (r.success) setRemoved(true)
    })
  }

  if (removed) return null

  const isPermanent = row.predictionExclude === 'permanent'

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/customers/${row.customerId}`} className="font-semibold text-blue-700 hover:underline text-sm">
            {row.customerName}
          </Link>
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
            isPermanent ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
          }`}>
            {isPermanent ? 'もう来なそう' : '一時除外'}
          </span>
        </div>
      </div>
      <button
        onClick={restore}
        disabled={isReadonly || isPending}
        className="shrink-0 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? '戻し中...' : '↩ リストに戻す'}
      </button>
    </div>
  )
}

export default function PredictionExcludedSection({ rows, isReadonly }: Props) {
  const [open, setOpen] = useState(false)

  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-700">
          除外中の顧客（{rows.length}名）
        </span>
        <span className="text-slate-400 text-sm">{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {rows.map((row) => (
            <ExcludedRow key={row.customerId} row={row} isReadonly={isReadonly} />
          ))}
        </div>
      )}
    </div>
  )
}
