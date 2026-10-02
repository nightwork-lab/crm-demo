import Link from 'next/link'
import { getCustomers, getLinks, getOrders } from '../lib/repository'
import { getAnniversaryAlerts, type AnniversaryAlert } from '../lib/anniversary'
import { getCustomerLifetimeStats } from '../lib/order-metrics'
import { getFirstVisitDates } from '../lib/anniversary'

function kindColor(a: AnniversaryAlert) {
  if (a.kind === 'birthday') return 'border-pink-200 bg-pink-50'
  if (a.kind === 'first_years') return 'border-yellow-200 bg-yellow-50'
  return 'border-blue-200 bg-blue-50'
}

function kindBadge(a: AnniversaryAlert) {
  if (a.kind === 'birthday') return 'bg-pink-100 text-pink-800'
  if (a.kind === 'first_years') return 'bg-yellow-100 text-yellow-800'
  return 'bg-blue-100 text-blue-800'
}

export default async function AnniversariesPage() {
  const [customers, links, allOrders] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrders(),
  ])
  const statsMap      = getCustomerLifetimeStats(allOrders, links, customers)
  const firstVisitMap = getFirstVisitDates(allOrders, links, customers)
  const today         = new Date().toISOString().slice(0, 10)

  const alerts = getAnniversaryAlerts(customers, allOrders, links, today, 30, { statsMap, firstVisitMap })

  const todayAlerts  = alerts.filter((a) => a.daysUntil === 0)
  const soonAlerts   = alerts.filter((a) => a.daysUntil > 0 && a.daysUntil <= 7)
  const laterAlerts  = alerts.filter((a) => a.daysUntil > 7)

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">記念日アラート</h1>
        <p className="text-sm text-slate-700 mt-1">
          今日から30日以内の誕生日・初回来店記念日
        </p>
      </header>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl border px-4 py-3 text-center ${todayAlerts.length > 0 ? 'bg-pink-50 border-pink-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${todayAlerts.length > 0 ? 'text-pink-700' : 'text-slate-900'}`}>{todayAlerts.length}</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">今日</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 text-center ${soonAlerts.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${soonAlerts.length > 0 ? 'text-yellow-700' : 'text-slate-900'}`}>{soonAlerts.length}</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">7日以内</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
          <p className="text-2xl font-bold text-slate-900">{laterAlerts.length}</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">30日以内</p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
          <p className="text-slate-700 font-medium">30日以内の記念日はありません</p>
          <p className="text-sm text-slate-500 mt-1">
            誕生日は顧客詳細の編集から登録できます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <AnniversaryCard key={i} alert={alert} kindColor={kindColor} kindBadge={kindBadge} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnniversaryCard({
  alert,
  kindColor,
  kindBadge,
}: {
  alert: AnniversaryAlert
  kindColor: (a: AnniversaryAlert) => string
  kindBadge: (a: AnniversaryAlert) => string
}) {
  const { customer, stats } = alert

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${kindColor(alert)}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/customers/${customer.id}`}
              className="font-bold text-base text-slate-900 hover:underline"
            >
              {customer.name}
            </Link>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${kindBadge(alert)}`}>
              {alert.label}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-y-0.5 text-sm text-slate-700">
            <span>記念日：<strong>{alert.date}</strong></span>
            {alert.firstVisitDate && (
              <>
                <span className="hidden sm:inline mx-2 text-slate-400">|</span>
                <span>初回予約：{alert.firstVisitDate}</span>
              </>
            )}
            {stats.totalOrderCount > 0 && (
              <>
                <span className="hidden sm:inline mx-2 text-slate-400">|</span>
                <span>来店 {stats.visitCount}回</span>
                <span className="hidden sm:inline mx-2 text-slate-400">|</span>
                <span>累計 ¥{stats.completedAmount.toLocaleString()}</span>
              </>
            )}
          </div>

          {customer.memo && (
            <p className="text-sm text-slate-600 line-clamp-1">{customer.memo}</p>
          )}
        </div>

        <div className="shrink-0">
          {alert.daysUntil === 0 ? (
            <span className="inline-block rounded-full bg-pink-600 text-white px-4 py-1.5 text-sm font-bold">
              今日
            </span>
          ) : (
            <span className="inline-block rounded-full bg-white border border-slate-300 text-slate-800 px-3 py-1.5 text-sm font-semibold">
              {alert.daysUntil}日後
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
