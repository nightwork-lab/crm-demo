'use client'

import { useState, useMemo, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PredictionTableRow, PredictionCompactRow } from './prediction-inline-row'
import PredictionExcludedSection from './prediction-excluded-section'
import { PredictionBatchContext, type BatchItem } from './prediction-batch-context'
import { upsertPredictionsBatchAction } from '../actions/upsert-prediction'

export type PredictionRowData = {
  customerId:       string
  customerName:     string
  lastMonthVisits:  number
  lastMonthRevenue: number
  actualVisits:     number
  actualRevenue:    number
  predictedVisits:  number | null
  predictedRevenue: number | null
  existingMemo:     string
  hasPrediction:    boolean
  lastVisitDate:    string | null  // "YYYY/MM/DD HH:mm" 過去来店のみ
  tags:             string[]
  followUpStatus:   'contacted' | 'needs_contact' | null
  predictionExclude: 'permanent' | 'temporary' | null
}

type SortKey =
  | 'lastMonth_desc'
  | 'lastMonth_asc'
  | 'actual_desc'
  | 'actual_asc'
  | 'predicted_desc'
  | 'predicted_asc'
  | 'diff_desc'
  | 'diff_asc'
  | 'name_asc'
  | 'unpredicted_first'
  | 'lastVisit_desc'
  | 'lastVisit_asc'
  | 'lastVisit_no_first'
  | 'needs_contact_first'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'lastMonth_desc',    label: '先月利用金額：高い順' },
  { value: 'lastMonth_asc',     label: '先月利用金額：低い順' },
  { value: 'actual_desc',       label: '今月利用金額：高い順' },
  { value: 'actual_asc',        label: '今月利用金額：低い順' },
  { value: 'predicted_desc',    label: '予測金額：高い順' },
  { value: 'predicted_asc',     label: '予測金額：低い順' },
  { value: 'diff_desc',         label: '差分：大きい順' },
  { value: 'diff_asc',          label: '差分：小さい順' },
  { value: 'name_asc',          label: '顧客名順' },
  { value: 'unpredicted_first', label: '予測未入力を上に' },
  { value: 'lastVisit_desc',    label: '最終来店：新しい順' },
  { value: 'lastVisit_asc',     label: '最終来店：古い順' },
  { value: 'lastVisit_no_first', label: '最終来店なしを上に' },
  { value: 'needs_contact_first', label: '要連絡を上に' },
]

const MAX = Number.MAX_SAFE_INTEGER

function sortRows(rows: PredictionRowData[], key: SortKey): PredictionRowData[] {
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'lastMonth_desc':
        return b.lastMonthRevenue - a.lastMonthRevenue
      case 'lastMonth_asc':
        return a.lastMonthRevenue - b.lastMonthRevenue
      case 'actual_desc':
        return b.actualRevenue - a.actualRevenue
      case 'actual_asc':
        return a.actualRevenue - b.actualRevenue
      case 'predicted_desc':
        return (b.predictedRevenue ?? -1) - (a.predictedRevenue ?? -1)
      case 'predicted_asc':
        return (a.predictedRevenue ?? MAX) - (b.predictedRevenue ?? MAX)
      case 'diff_desc': {
        const da = a.predictedRevenue != null ? a.actualRevenue - a.predictedRevenue : -MAX
        const db = b.predictedRevenue != null ? b.actualRevenue - b.predictedRevenue : -MAX
        return db - da
      }
      case 'diff_asc': {
        const da = a.predictedRevenue != null ? a.actualRevenue - a.predictedRevenue : MAX
        const db = b.predictedRevenue != null ? b.actualRevenue - b.predictedRevenue : MAX
        return da - db
      }
      case 'name_asc':
        return a.customerName.localeCompare(b.customerName, 'ja')
      case 'unpredicted_first':
        if (!a.hasPrediction && b.hasPrediction) return -1
        if (a.hasPrediction && !b.hasPrediction) return 1
        return (b.predictedRevenue ?? 0) - (a.predictedRevenue ?? 0)
      case 'lastVisit_desc':
        if (!a.lastVisitDate && !b.lastVisitDate) return 0
        if (!a.lastVisitDate) return 1
        if (!b.lastVisitDate) return -1
        return b.lastVisitDate.localeCompare(a.lastVisitDate)
      case 'lastVisit_asc':
        if (!a.lastVisitDate && !b.lastVisitDate) return 0
        if (!a.lastVisitDate) return 1
        if (!b.lastVisitDate) return -1
        return a.lastVisitDate.localeCompare(b.lastVisitDate)
      case 'lastVisit_no_first':
        if (!a.lastVisitDate && !b.lastVisitDate) return 0
        if (!a.lastVisitDate) return -1
        if (!b.lastVisitDate) return 1
        return b.lastVisitDate.localeCompare(a.lastVisitDate)
      case 'needs_contact_first': {
        // 要連絡 → 未対応 → 対応済み の順
        const rank = (s: PredictionRowData['followUpStatus']) =>
          s === 'needs_contact' ? 0 : s == null ? 1 : 2
        const diff = rank(a.followUpStatus) - rank(b.followUpStatus)
        if (diff !== 0) return diff
        return b.lastMonthRevenue - a.lastMonthRevenue
      }
    }
  })
}

type Props = {
  rows:             PredictionRowData[]
  excludedRows:     PredictionRowData[]
  targetMonth:      string
  isReadonly:       boolean
  unlinkedRevenue:  number
  unlinkedVisits:   number
  grandActRevenue:  number
  grandActVisits:   number
  totalPredRevenue: number
  achieveRate:      number | null
}

export default function PredictionSortList({
  rows: initialRows,
  excludedRows,
  targetMonth,
  isReadonly,
  unlinkedRevenue,
  unlinkedVisits,
  grandActRevenue,
  grandActVisits,
  totalPredRevenue,
  achieveRate,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('lastMonth_desc')

  const sortedRows = useMemo(() => sortRows(initialRows, sortKey), [initialRows, sortKey])

  // ── 一括保存（「全て保存」）──
  const router = useRouter()
  const dirtyRef = useRef(new Map<string, BatchItem>())
  const [dirtyCount, setDirtyCount] = useState(0)
  const [batchError, setBatchError] = useState('')
  const [isSaving, startSaving] = useTransition()

  const report = useCallback((customerId: string, item: BatchItem | null) => {
    const m = dirtyRef.current
    if (item) m.set(customerId, item)
    else m.delete(customerId)
    setDirtyCount((prev) => (prev === m.size ? prev : m.size))
  }, [])

  const saveAll = () => {
    const items = Array.from(dirtyRef.current.values())
    if (items.length === 0) return
    setBatchError('')
    startSaving(async () => {
      const r = await upsertPredictionsBatchAction(items)
      if (r.success) {
        dirtyRef.current.clear()
        setDirtyCount(0)
        router.refresh()
      } else {
        setBatchError(r.error)
      }
    })
  }

  const batchValue = useMemo(() => ({ report, enabled: !isReadonly }), [report, isReadonly])

  const sortControl = (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-700 shrink-0">並び替え</span>
      <select
        value={sortKey}
        onChange={(e) => setSortKey(e.target.value as SortKey)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )

  const grandDiff = grandActRevenue - totalPredRevenue

  return (
    <PredictionBatchContext.Provider value={batchValue}>
      {/* Desktop table */}
      <div className="hidden md:block space-y-3">
        {sortControl}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">最終来店</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">先月来店</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">先月利用金額</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">今月実績来店</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">今月実績売上</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">今月予測売上</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">差分</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">今月対応</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <PredictionTableRow
                  key={row.customerId}
                  customerId={row.customerId}
                  customerName={row.customerName}
                  targetMonth={targetMonth}
                  lastMonthVisits={row.lastMonthVisits}
                  lastMonthRevenue={row.lastMonthRevenue}
                  actualVisits={row.actualVisits}
                  actualRevenue={row.actualRevenue}
                  predictedVisits={row.predictedVisits}
                  predictedRevenue={row.predictedRevenue}
                  existingMemo={row.existingMemo}
                  hasPrediction={row.hasPrediction}
                  isReadonly={isReadonly}
                  lastVisitDate={row.lastVisitDate}
                  tags={row.tags}
                  followUpStatus={row.followUpStatus}
                />
              ))}
            </tbody>
            {unlinkedRevenue > 0 && (
              <tbody>
                <tr className="border-t border-blue-100 bg-blue-50/30">
                  <td className="px-4 py-2.5 text-sm text-slate-600 italic">未紐付け / ID不明</td>
                  <td colSpan={3} />
                  <td className="px-4 py-2.5 text-right text-sm text-slate-600">{unlinkedVisits}件</td>
                  <td className="px-4 py-2.5 text-right text-sm text-blue-700 font-semibold">
                    ¥{unlinkedRevenue.toLocaleString()}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            )}
            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
              <tr>
                <td className="px-4 py-3 font-bold text-slate-900">月全体合計</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right font-bold text-slate-900">{grandActVisits}件</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">¥{grandActRevenue.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">¥{totalPredRevenue.toLocaleString()}</td>
                <td className={`px-4 py-3 text-right font-bold ${
                  totalPredRevenue === 0 ? 'text-slate-400' :
                  grandDiff >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {totalPredRevenue > 0
                    ? grandDiff >= 0
                      ? `+¥${grandDiff.toLocaleString()}`
                      : `-¥${Math.abs(grandDiff).toLocaleString()}`
                    : '—'}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Mobile: コンパクト行（タップで詳細展開） */}
      <div className="md:hidden space-y-2">
        {sortControl}
        {sortedRows.map((row) => (
          <PredictionCompactRow
            key={row.customerId}
            customerId={row.customerId}
            customerName={row.customerName}
            targetMonth={targetMonth}
            lastMonthVisits={row.lastMonthVisits}
            lastMonthRevenue={row.lastMonthRevenue}
            actualVisits={row.actualVisits}
            actualRevenue={row.actualRevenue}
            predictedVisits={row.predictedVisits}
            predictedRevenue={row.predictedRevenue}
            existingMemo={row.existingMemo}
            hasPrediction={row.hasPrediction}
            isReadonly={isReadonly}
            lastVisitDate={row.lastVisitDate}
            tags={row.tags}
            followUpStatus={row.followUpStatus}
          />
        ))}

        {unlinkedRevenue > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">未紐付け / ID不明</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">売上</p>
                <p className="font-bold text-blue-800">¥{unlinkedRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">件数</p>
                <p className="font-bold text-blue-800">{unlinkedVisits}件</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-slate-800 text-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-3">月全体合計</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400">月全体予測売上</p>
              <p className="font-bold">¥{totalPredRevenue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">月全体実績売上</p>
              <p className="font-bold">¥{grandActRevenue.toLocaleString()}</p>
            </div>
          </div>
          {achieveRate != null && (
            <p className={`mt-2 text-lg font-bold ${
              achieveRate >= 100 ? 'text-green-400' :
              achieveRate >= 70  ? 'text-yellow-400' : 'text-red-400'
            }`}>
              達成率 {achieveRate}%
            </p>
          )}
        </div>
      </div>

      {/* 除外中の顧客（PC・モバイル共通） */}
      <PredictionExcludedSection rows={excludedRows} isReadonly={isReadonly} />

      {/* 一括保存バー（未保存の入力があるときだけ表示・画面下部に固定） */}
      {!isReadonly && dirtyCount > 0 && (
        <div className="sticky bottom-20 md:bottom-4 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-slate-900 text-white shadow-lg pl-4 pr-2 py-2">
            <span className="text-sm font-medium whitespace-nowrap">
              {dirtyCount}件 未保存
            </span>
            {batchError && <span className="text-xs text-red-300">{batchError}</span>}
            <button
              onClick={saveAll}
              disabled={isSaving}
              className="rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-1.5 text-sm font-bold whitespace-nowrap transition-colors"
            >
              {isSaving ? '保存中...' : `全て保存（${dirtyCount}件）`}
            </button>
          </div>
        </div>
      )}
    </PredictionBatchContext.Provider>
  )
}
