import type { LinkedOrder } from '../lib/customer-detail'
import type { LinkMethod } from '../lib/customer-link'

const statusColor: Record<string, string> = {
  '確定':       'bg-green-100 text-green-800',
  '完了':       'bg-slate-200 text-slate-700',
  '未確定':     'bg-yellow-100 text-yellow-800',
  'キャンセル': 'bg-red-100 text-red-800',
  '現金未確認': 'bg-orange-100 text-orange-800',
}

const linkMethodLabel: Record<LinkMethod, { label: string; className: string }> = {
  manual:     { label: '手動',   className: 'bg-blue-100 text-blue-800' },
  alias:      { label: '辞書',   className: 'bg-purple-100 text-purple-800' },
  name_match: { label: '名前',   className: 'bg-slate-200 text-slate-700' },
}

type Props = {
  orders: LinkedOrder[]
}

export default function OrderHistory({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">来店履歴がありません</p>
        <p className="mt-1 text-sm text-slate-700">
          npm run sync:happ を実行して紐付けを行ってください
        </p>
      </div>
    )
  }

  return (
    <>
      {/* PC: テーブル */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">開始時間</th>
              <th className="px-4 py-3">コース</th>
              <th className="px-4 py-3">合計金額</th>
              <th className="px-4 py-3">ギャラ</th>
              <th className="px-4 py-3">支払い方法</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3">紐付け</th>
              <th className="px-4 py-3 text-right">Order ID</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderId} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                  {order.startTime}
                </td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{order.course}</td>
                <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                  ¥{order.totalAmount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                  ¥{order.therapistFee.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{order.paymentMethod}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[order.status] ?? 'bg-slate-200 text-slate-700'}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${linkMethodLabel[order.linkMethod].className}`}>
                    {linkMethodLabel[order.linkMethod].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-500 font-mono text-xs whitespace-nowrap">
                  #{order.orderId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ: カード */}
      <div className="md:hidden space-y-3">
        {orders.map((order) => (
          <div key={order.orderId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* ヘッダー行 */}
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-slate-900">{order.startTime}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[order.status] ?? 'bg-slate-200 text-slate-700'}`}>
                {order.status}
              </span>
            </div>

            {/* コース */}
            <p className="mt-1 text-sm text-slate-700">{order.course}</p>

            {/* 金額行 */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">合計金額</p>
                <p className="mt-0.5 font-bold text-slate-900">¥{order.totalAmount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">ギャラ</p>
                <p className="mt-0.5 font-bold text-slate-900">¥{order.therapistFee.toLocaleString()}</p>
              </div>
            </div>

            {/* サブ情報 */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">{order.paymentMethod}</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${linkMethodLabel[order.linkMethod].className}`}>
                  {linkMethodLabel[order.linkMethod].label}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">#{order.orderId}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
