'use client'

import { useState, type ReactNode } from 'react'

/**
 * 予約（オーダー）詳細のポップアップ。
 * どのページからでも同じ見た目で詳細を確認できるようにする共通部品。
 * trigger に渡した要素をタップすると開く。
 *
 * 注意: happ の取り込みデータに「場所」は含まれないため表示できない
 * （モーダルHTMLに項目自体が存在しない）。
 */
export type OrderDetailData = {
  orderId:       number
  customerName?: string
  startTime:     string
  endTime?:      string
  course:        string
  totalAmount:   number
  therapistFee?: number
  paymentMethod: string
  status:        string
}

const statusColor: Record<string, string> = {
  '確定':       'bg-green-100 text-green-800',
  '確定済':     'bg-green-100 text-green-800',
  '完了':       'bg-slate-200 text-slate-700',
  '未確定':     'bg-yellow-100 text-yellow-800',
  'キャンセル': 'bg-red-100 text-red-800',
  '現金未確認': 'bg-orange-100 text-orange-800',
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-b-0">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-900 text-right">{children}</span>
    </div>
  )
}

export default function OrderDetailDialog({
  order, trigger, triggerClassName,
}: {
  order:            OrderDetailData
  trigger:          ReactNode
  triggerClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={triggerClassName ?? 'text-left w-full cursor-pointer'}
        title="タップで予約の詳細を表示"
      >
        {trigger}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 sm:mx-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">予約の詳細</h3>
                {order.customerName && (
                  <p className="text-sm text-slate-700 mt-0.5">{order.customerName} 様</p>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-700 p-1 -mr-1 -mt-1"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-1">
              <Row label="日時">
                {order.startTime}
                {order.endTime ? ` 〜 ${order.endTime.slice(11) || order.endTime}` : ''}
              </Row>
              <Row label="コース">{order.course || '－'}</Row>
              <Row label="合計金額">¥{order.totalAmount.toLocaleString()}</Row>
              {order.therapistFee != null && (
                <Row label="ギャラ">¥{order.therapistFee.toLocaleString()}</Row>
              )}
              <Row label="支払い方法">{order.paymentMethod || '－'}</Row>
              <Row label="ステータス">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {order.status || '－'}
                </span>
              </Row>
              <Row label="Order ID">#{order.orderId}</Row>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  )
}
