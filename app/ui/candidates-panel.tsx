'use client'

import { useState, useMemo } from 'react'
import type { RegistrationCandidate } from '../lib/customer-link'
import type { Customer } from '../lib/data'
import CreateCustomerDialog from './create-customer-dialog'
import LinkCustomerDialog, { type CustomerLinkMeta } from './link-customer-dialog'

type SortKey = 'latest' | 'count' | 'amount' | 'name'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest',  label: '最新来店順' },
  { key: 'count',   label: '件数順' },
  { key: 'amount',  label: '合計金額順' },
  { key: 'name',    label: '名前順' },
]

type Props = {
  candidates:    RegistrationCandidate[]
  customers:     Customer[]
  customerMeta?: Record<string, CustomerLinkMeta>
  availableTags: string[]
  isReadonly?:   boolean
}

export default function CandidatesPanel({ candidates, customers, customerMeta, availableTags, isReadonly = false }: Props) {
  const [query,   setQuery]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('latest')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidates
      .filter((c) => !q || c.customerName.toLowerCase().includes(q))
      .sort((a, b) => {
        switch (sortKey) {
          case 'latest':  return b.latestStartTime.localeCompare(a.latestStartTime)
          case 'count':   return b.orderCount - a.orderCount
          case 'amount':  return b.totalAmount - a.totalAmount
          case 'name':    return a.customerName.localeCompare(b.customerName, 'ja')
        }
      })
  }, [candidates, query, sortKey])

  return (
    <div className="space-y-4">
      {/* 検索 + ソート */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="顧客名で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <div className="flex gap-1.5 flex-wrap">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                sortKey === key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {query && (
        <p className="text-sm text-slate-700 font-medium">{filtered.length}件 / {candidates.length}件中</p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-slate-700 font-medium">
            {candidates.length === 0 ? '顧客登録候補はありません' : '条件に一致する候補がありません'}
          </p>
        </div>
      ) : (
        <>
          {/* PC: テーブル */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">お客様名</th>
                  <th className="px-4 py-3">happ ID</th>
                  <th className="px-4 py-3">件数</th>
                  <th className="px-4 py-3">最終来店</th>
                  <th className="px-4 py-3">合計金額</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={`${c.happCustomerId}-${c.customerName}`} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{c.customerName}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                      {c.happCustomerId > 0 ? c.happCustomerId : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{c.orderCount}件</td>
                    <td className="px-4 py-3 text-slate-700">{c.latestStartTime.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">¥{c.totalAmount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <CreateCustomerDialog candidate={c} availableTags={availableTags} isReadonly={isReadonly} />
                        <LinkCustomerDialog candidate={c} customers={customers} customerMeta={customerMeta} isReadonly={isReadonly} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード */}
          <div className="md:hidden space-y-3">
            {filtered.map((c) => (
              <div key={`${c.happCustomerId}-${c.customerName}`} className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{c.customerName}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-700">
                      {c.happCustomerId > 0 && <span>ID: {c.happCustomerId}</span>}
                      <span>{c.orderCount}件</span>
                      <span className="font-medium text-slate-900">¥{c.totalAmount.toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-700">{c.latestStartTime.slice(0, 10)}</p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-2">
                    <CreateCustomerDialog candidate={c} availableTags={availableTags} isReadonly={isReadonly} />
                    <LinkCustomerDialog candidate={c} customers={customers} customerMeta={customerMeta} isReadonly={isReadonly} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
