'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Customer } from '../lib/data'
import type { ComputedStats } from '../lib/customer-stats'

type SortKey = 'lastVisit' | 'totalSales' | 'visitCount' | 'name' | 'tag'
type AlertFilter = 'all' | 'active' | 'excluded'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'lastVisit',   label: '最新来店順' },
  { key: 'totalSales',  label: '累計売上順' },
  { key: 'visitCount',  label: '来店回数順' },
  { key: 'name',        label: '顧客名順' },
  { key: 'tag',         label: 'タグ/ジャンル順' },
]

const ALERT_FILTER_OPTIONS: { key: AlertFilter; label: string }[] = [
  { key: 'all',      label: '全て' },
  { key: 'active',   label: 'アラート対象' },
  { key: 'excluded', label: 'アラート除外' },
]

type Props = {
  customers:   Customer[]
  statsRecord: Record<string, ComputedStats>
}

export default function CustomerSearch({ customers, statsRecord }: Props) {
  const [query,       setQuery]       = useState('')
  const [sortKey,     setSortKey]     = useState<SortKey>('lastVisit')
  const [activeTag,   setActiveTag]   = useState<string | null>(null)
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all')

  // 全タグを収集（重複除去・ソート）
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const c of customers) {
      for (const t of c.tags ?? []) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [customers])

  const enriched = useMemo(() =>
    customers.map((c) => {
      const s = statsRecord[c.id]
      const hasHapp    = s != null && s.totalOrderCount > 0
      const lastVisit  = hasHapp && s.lastVisitDate   ? s.lastVisitDate   : c.lastVisit
      const nextReserv = hasHapp && s.nextReservation ? s.nextReservation : c.nextReservation
      const totalSales = hasHapp ? s.completedAmount : c.totalSales
      const visitCount = hasHapp ? s.visitCount      : c.repeatCount
      return { c, s, hasHapp, lastVisit, nextReserv, totalSales, visitCount }
    })
  , [customers, statsRecord])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return enriched.filter(({ c }) => {
      const isAlertExcluded = c.alertExcluded === true
      if (alertFilter === 'active'   && isAlertExcluded)  return false
      if (alertFilter === 'excluded' && !isAlertExcluded) return false
      if (activeTag && !(c.tags ?? []).includes(activeTag)) return false
      if (!q) return true
      return (
        c.name.includes(q) ||
        (c.memo && c.memo.includes(q)) ||
        (c.tags && c.tags.some((t) => t.includes(q)))
      )
    })
  }, [enriched, query, activeTag, alertFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'lastVisit':
          return (b.lastVisit ?? '').localeCompare(a.lastVisit ?? '')
        case 'totalSales':
          return b.totalSales - a.totalSales
        case 'visitCount':
          return b.visitCount - a.visitCount
        case 'name':
          return a.c.name.localeCompare(b.c.name, 'ja')
        case 'tag': {
          const ta = (a.c.tags ?? [])[0] ?? ''
          const tb = (b.c.tags ?? [])[0] ?? ''
          if (!ta && tb)  return 1
          if (ta  && !tb) return -1
          if (!ta && !tb) return 0
          return ta.localeCompare(tb, 'ja')
        }
      }
    })
  }, [filtered, sortKey])

  return (
    <div className="space-y-4">
      {/* 検索バー */}
      <input
        type="text"
        placeholder="名前・メモ・タグで検索..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      {/* ソートタブ */}
      <div className="flex flex-wrap gap-2">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              sortKey === key
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* アラートフィルター */}
      <div className="flex flex-wrap gap-2">
        {ALERT_FILTER_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAlertFilter(key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              alertFilter === key
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* タグフィルター */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                activeTag === tag
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {tag}
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              ✕ 絞り込み解除
            </button>
          )}
        </div>
      )}

      {(query || activeTag) && (
        <p className="text-sm text-slate-700 font-medium">
          {sorted.length}件 / {customers.length}件中
        </p>
      )}

      {/* PC: テーブル */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">顧客名</th>
              <th className="px-4 py-3">最終来店</th>
              <th className="px-4 py-3">次回予約</th>
              <th className="px-4 py-3">累計売上</th>
              <th className="px-4 py-3">来店回数</th>
              <th className="px-4 py-3">タグ</th>
              <th className="px-4 py-3">メモ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-700 font-medium">
                  該当する顧客が見つかりません
                </td>
              </tr>
            ) : (
              sorted.map(({ c, s, hasHapp, lastVisit, nextReserv, totalSales, visitCount }) => (
                <tr key={c.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <Link href={`/customers/${c.id}`} className="text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {lastVisit}
                    {hasHapp && s.lastVisitDate && (
                      <span className="ml-1 text-xs text-blue-600">●</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {nextReserv ? (
                      <span className="font-medium text-green-800">{nextReserv}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    ¥{totalSales.toLocaleString()}
                    {hasHapp && <span className="ml-1 text-xs text-blue-600">●</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {visitCount}回
                    {hasHapp && <span className="ml-1 text-xs text-blue-600">●</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                            activeTag === tag
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                      {c.alertExcluded && (
                        <span className="rounded-full bg-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          除外中
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{c.memo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
          <span className="text-blue-600">●</span> happ-s.com 自動計算値
        </div>
      </div>

      {/* スマホ: カード */}
      <div className="md:hidden space-y-3">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-slate-700 font-medium">該当する顧客が見つかりません</p>
          </div>
        ) : (
          sorted.map(({ c, s, hasHapp, lastVisit, nextReserv, totalSales, visitCount }) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-slate-900 text-base">{c.name}</p>
                {nextReserv && (
                  <span className="shrink-0 rounded-lg bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                    次回 {nextReserv}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-slate-700">
                最終来店：{lastVisit}
                {hasHapp && s.lastVisitDate && <span className="ml-1 text-blue-600 text-xs">●</span>}
              </p>

              <div className="mt-3 flex gap-5">
                <div>
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    累計売上{hasHapp ? <span className="ml-0.5 text-blue-600">●</span> : ''}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">¥{totalSales.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    来店回数{hasHapp ? <span className="ml-0.5 text-blue-600">●</span> : ''}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">{visitCount}回</p>
                </div>
              </div>

              {(c.tags && c.tags.length > 0 || c.alertExcluded) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.tags?.map((tag) => (
                    <span key={tag} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      activeTag === tag ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {tag}
                    </span>
                  ))}
                  {c.alertExcluded && (
                    <span className="rounded-full bg-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      除外中
                    </span>
                  )}
                </div>
              )}
              {c.memo && (
                <p className="mt-2 text-sm text-slate-700 line-clamp-2">{c.memo}</p>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
