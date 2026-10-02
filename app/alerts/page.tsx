import Link from 'next/link'
import { getCustomers, getLinks, getOrders } from '../lib/repository'
import { getHappAlerts, type HappAlertLevel } from '../lib/happ-alert'

const levelConfig: Record<HappAlertLevel, {
  label: string; bg: string; border: string; badge: string
  dot: string; countColor: string; labelColor: string; cardBg: string
}> = {
  critical: {
    label: '要対応', bg: 'bg-red-50', border: 'border-red-200',
    badge: 'bg-red-100 text-red-800', dot: 'bg-red-500',
    countColor: 'text-red-700', labelColor: 'text-red-700', cardBg: 'bg-red-50 border-red-100',
  },
  warning: {
    label: '注意', bg: 'bg-yellow-50', border: 'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500',
    countColor: 'text-yellow-700', labelColor: 'text-yellow-700', cardBg: 'bg-yellow-50 border-yellow-100',
  },
  info: {
    label: '確認', bg: 'bg-blue-50', border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500',
    countColor: 'text-blue-700', labelColor: 'text-blue-700', cardBg: 'bg-blue-50 border-blue-100',
  },
}

export default async function AlertsPage() {
  const [customers, links, allOrders] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrders(),
  ])
  const alerts   = getHappAlerts(undefined, { allOrders, links, customers })
  const critical = alerts.filter((a) => a.level === 'critical')
  const warning  = alerts.filter((a) => a.level === 'warning')
  const info     = alerts.filter((a) => a.level === 'info')

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-4xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">来店アラート</h1>
        <p className="text-sm text-slate-700 mt-1">
          happ-s.com の紐付き済みオーダーを元に、最終来店日から経過日数を計算しています。
          次回予約がある顧客は除外されます。
        </p>
      </header>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-3">
        {(['critical', 'warning', 'info'] as const).map((lvl) => {
          const cfg   = levelConfig[lvl]
          const count = lvl === 'critical' ? critical.length : lvl === 'warning' ? warning.length : info.length
          return (
            <div key={lvl} className={`rounded-xl border px-4 py-4 text-center ${cfg.cardBg}`}>
              <p className={`text-2xl font-bold ${cfg.countColor}`}>{count}</p>
              <p className={`text-sm font-semibold mt-0.5 ${cfg.labelColor}`}>{cfg.label}</p>
            </div>
          )
        })}
      </div>

      {alerts.length === 0 && (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
          <p className="text-slate-700 font-medium">現在アラート対象の顧客はいません</p>
          <p className="text-sm text-slate-600 mt-2">
            happ オーダーが紐付いた顧客のみが対象です。
            <Link href="/" className="text-blue-700 hover:underline ml-1">顧客登録候補を確認 →</Link>
          </p>
        </div>
      )}

      {([
        { level: 'critical', items: critical },
        { level: 'warning',  items: warning  },
        { level: 'info',     items: info     },
      ] as const).map(({ level, items }) => {
        if (items.length === 0) return null
        const config = levelConfig[level]
        return (
          <section key={level}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
              <h2 className="text-base font-bold text-slate-900">
                {config.label}（{items.length}件）
              </h2>
            </div>
            <div className="space-y-3">
              {items.map((alert) => (
                <div
                  key={alert.customer.id}
                  className={`rounded-xl border p-4 md:p-5 ${config.bg} ${config.border}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <Link
                        href={`/customers/${alert.customer.id}`}
                        className="font-bold text-base text-slate-900 hover:underline"
                      >
                        {alert.customer.name}
                      </Link>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-y-0.5 text-sm text-slate-700">
                        <span>最終来店：<strong>{alert.lastVisitDate}</strong></span>
                        <span className="hidden sm:inline mx-2 text-slate-400">|</span>
                        <span>経過：<strong>{alert.daysSinceVisit}日</strong></span>
                        <span className="hidden sm:inline mx-2 text-slate-400">|</span>
                        <span>来店回数：{alert.visitCount}回</span>
                        <span className="hidden sm:inline mx-2 text-slate-400">|</span>
                        <span>累計：¥{alert.completedAmount.toLocaleString()}</span>
                      </div>
                      {alert.customer.memo && (
                        <p className="text-sm text-slate-700">{alert.customer.memo}</p>
                      )}
                    </div>
                    <div className="flex sm:flex-col sm:text-right items-center sm:items-end gap-3 sm:gap-2 shrink-0">
                      <span className={`inline-block rounded-full px-3 py-1.5 text-sm font-semibold ${config.badge}`}>
                        {alert.message}
                      </span>
                      {alert.nextReservation && (
                        <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                          次回予約: {alert.nextReservation}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
