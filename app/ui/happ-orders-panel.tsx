'use client'

import { useState } from 'react'
import OrderDetailDialog, { type OrderDetailData } from './order-detail-dialog'

// ---------- 型定義 ----------

export type MinOrder = {
  orderId:        number
  customerName:   string
  happCustomerId: number
  startTime:      string
  endTime:        string
  course:         string
  totalAmount:    number
  therapistFee:   number
  status:         string
  paymentMethod:  string
  linkType:       'linked' | 'candidate'
  crmName?:       string
  crmId?:         string
  linkMethod?:    string
}

/** 行タップで開く詳細ダイアログ用のデータに変換する */
function toDetail(o: MinOrder): OrderDetailData {
  return {
    orderId:       o.orderId,
    customerName:  o.customerName,
    startTime:     o.startTime,
    endTime:       o.endTime,
    course:        o.course,
    totalAmount:   o.totalAmount,
    therapistFee:  o.therapistFee,
    paymentMethod: o.paymentMethod,
    status:        o.status,
  }
}

export type OrderMonthGroup = {
  monthKey:       string   // "2026-05"
  monthLabel:     string   // "2026年5月"
  totalAmount:    number
  linkedCount:    number
  candidateCount: number
  orders:         MinOrder[]
}

const statusColor: Record<string, string> = {
  '確定':       'bg-green-100 text-green-800',
  '完了':       'bg-slate-200 text-slate-700',
  '未確定':     'bg-yellow-100 text-yellow-800',
  'キャンセル': 'bg-red-100 text-red-800',
  '現金未確認': 'bg-orange-100 text-orange-800',
  '確定済':     'bg-green-100 text-green-800',
}

const linkMethodLabel: Record<string, { label: string; cn: string }> = {
  manual:     { label: '手動', cn: 'bg-blue-100 text-blue-800' },
  alias:      { label: '辞書', cn: 'bg-purple-100 text-purple-800' },
  name_match: { label: '名前', cn: 'bg-slate-200 text-slate-700' },
}

// ---------- コンポーネント ----------

type Props = {
  groups:        OrderMonthGroup[]
  syncedAt:      string | null
  linkedTotal:   number
  candidateTotal: number
}

export default function HappOrdersPanel({
  groups,
  syncedAt,
  linkedTotal,
  candidateTotal,
}: Props) {
  // 最新月だけ初期展開
  const [openMonths, setOpenMonths] = useState<Set<string>>(
    () => new Set(groups.length > 0 ? [groups[0].monthKey] : []),
  )
  const [query, setQuery]           = useState('')
  const [unlinkedOnly, setUnlinked] = useState(false)

  const toggle = (key: string) =>
    setOpenMonths(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const filterOrders = (orders: MinOrder[]) =>
    orders.filter(o => {
      if (unlinkedOnly && o.linkType !== 'candidate') return false
      if (query && !o.customerName.includes(query)) return false
      return true
    })

  const visibleGroups = groups
    .map(g => ({ ...g, filtered: filterOrders(g.orders) }))
    .filter(g => g.filtered.length > 0)

  return (
    <div className="space-y-4">
      {/* サマリー行 */}
      <div className="flex flex-wrap items-center gap-3">
        {syncedAt && (
          <p className="text-sm font-medium text-slate-700">
            最終同期：{new Date(syncedAt).toLocaleString('ja-JP')}
          </p>
        )}
        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
          来店履歴候補 {linkedTotal}件
        </span>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          顧客登録候補 {candidateTotal}件
        </span>
      </div>

      {/* フィルター */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="顧客名で検索..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unlinkedOnly}
            onChange={e => setUnlinked(e.target.checked)}
            className="w-4 h-4"
          />
          未紐付けのみ表示
        </label>
      </div>

      {/* 月別アコーディオン */}
      {visibleGroups.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-slate-700 font-medium">条件に一致するオーダーがありません</p>
        </div>
      )}

      {visibleGroups.map(({ monthKey, monthLabel, totalAmount, linkedCount, candidateCount, filtered }) => {
        const isOpen = openMonths.has(monthKey)
        return (
          <div key={monthKey} className="rounded-2xl bg-white shadow-sm overflow-hidden">
            {/* 月ヘッダー */}
            <button
              onClick={() => toggle(monthKey)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-slate-900">{monthLabel}</span>
                <span className="text-sm text-slate-600">{filtered.length}件</span>
                <span className="text-sm font-medium text-slate-900">
                  ¥{totalAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {candidateCount > 0 && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                    未紐付け {candidateCount}件
                  </span>
                )}
                <span className={`text-slate-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </button>

            {/* 展開コンテンツ */}
            {isOpen && (
              <div className="border-t border-slate-100">
                {/* PC: テーブル */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-2.5">お客様名</th>
                        <th className="px-4 py-2.5">開始時間</th>
                        <th className="px-4 py-2.5">コース</th>
                        <th className="px-4 py-2.5">合計金額</th>
                        <th className="px-4 py-2.5">支払い</th>
                        <th className="px-4 py-2.5">状態</th>
                        <th className="px-4 py-2.5">紐付け</th>
                        <th className="px-4 py-2.5 text-right text-xs text-slate-400">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(o => (
                        <tr
                          key={o.orderId}
                          className={`border-t border-slate-100 hover:bg-slate-50 ${
                            o.linkType === 'candidate' ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                            <OrderDetailDialog
                              order={toDetail(o)}
                              triggerClassName="cursor-pointer"
                              trigger={
                                <span className="underline decoration-dotted underline-offset-2 hover:text-blue-700">
                                  {o.customerName}
                                </span>
                              }
                            />
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{o.startTime}</td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{o.course}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                            ¥{o.totalAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap text-xs">{o.paymentMethod}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[o.status] ?? 'bg-slate-100 text-slate-700'}`}>
                              {o.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {o.linkType === 'linked' ? (
                              <div className="flex items-center gap-1.5">
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                                  来店履歴候補
                                </span>
                                {o.linkMethod && linkMethodLabel[o.linkMethod] && (
                                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${linkMethodLabel[o.linkMethod].cn}`}>
                                    {linkMethodLabel[o.linkMethod].label}
                                  </span>
                                )}
                                {o.crmName && (
                                  <span className="text-xs font-medium text-slate-700">{o.crmName}</span>
                                )}
                              </div>
                            ) : (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                顧客登録候補
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-slate-400 font-mono whitespace-nowrap">
                            #{o.orderId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* スマホ: カード（タップで詳細） */}
                <div className="md:hidden space-y-2 p-3">
                  {filtered.map(o => (
                    <OrderDetailDialog
                      key={o.orderId}
                      order={toDetail(o)}
                      triggerClassName="block w-full text-left cursor-pointer"
                      trigger={
                    <div
                      className={`rounded-xl border p-3 active:bg-slate-100 ${
                        o.linkType === 'candidate'
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-slate-900 text-sm">{o.customerName}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[o.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {o.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-0.5">{o.startTime} · {o.course}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-slate-900 text-sm">¥{o.totalAmount.toLocaleString()}</span>
                        {o.linkType === 'linked' ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                            {o.crmName ?? '来店履歴候補'}
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            顧客登録候補
                          </span>
                        )}
                      </div>
                    </div>
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
