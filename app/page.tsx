import Link from 'next/link'
import { getAllData } from './lib/repository'
import { collectCandidates } from './lib/customer-link'
import { getHappAlerts } from './lib/happ-alert'
import { getAnniversaryAlerts } from './lib/anniversary'
import { isWriteBlocked } from './lib/app-mode'
import { isBookableOrder, getCustomerNextReservationOrders } from './lib/order-metrics'
import OrderDetailDialog from './ui/order-detail-dialog'
export default async function DashboardPage() {
  const readonly = isWriteBlocked()
  const { customers, links, orders: allOrders, happData, statsMap, firstVisitMap } = await getAllData()

  // 次回予約のオーダー実体（表示のタップ詳細に使う）
  const nextResMap = getCustomerNextReservationOrders(allOrders, links, customers)

  // KPI
  const totalCustomers = customers.length
  const totalRepeats   = customers.reduce((s, c) => s + c.repeatCount, 0)

  // 累計売上: 全オーダー合計（キャンセル・仮予約除外）。顧客紐付けに依存しない実売上。
  // データなければ手入力値にフォールバック。
  const happTotalSales = allOrders.length > 0
    ? allOrders.filter(isBookableOrder).reduce((s, o) => s + o.totalAmount, 0)
    : null
  const totalSales = happTotalSales ?? customers.reduce((s, c) => s + c.totalSales, 0)

  // 最近の来店顧客
  const recentCustomers = customers
    .flatMap((c) => {
      const s = statsMap.get(c.id)
      if (!s || !s.lastVisitDate) return []
      return [{ customer: c, stats: s }]
    })
    .sort((a, b) => (b.stats.lastVisitDate ?? '').localeCompare(a.stats.lastVisitDate ?? ''))
    .slice(0, 5)

  const today          = new Date().toISOString().slice(0, 10)
  const happAlerts     = getHappAlerts(today, { allOrders, links, customers })
  const criticalAlerts = happAlerts.filter((a) => a.level === 'critical').length

  const anniversaryAlerts = getAnniversaryAlerts(customers, allOrders, links, today, 30, { statsMap, firstVisitMap }).slice(0, 3)

  const orderCount     = allOrders.length
  const candidateCount = allOrders.length > 0 ? collectCandidates(allOrders, links, customers).length : 0

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-5xl">
      {readonly && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">閲覧専用モードです。</span>
          スマホから確認できますが、同期・編集・保存はローカル環境で行ってください。
        </div>
      )}

      <header>
        <p className="text-sm font-medium text-slate-700">概要</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">ダッシュボード</h1>
      </header>

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">顧客数</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {totalCustomers}<span className="text-base font-normal text-slate-700 ml-1">名</span>
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">累計売上</p>
          <p className="mt-2 text-lg md:text-2xl font-bold text-slate-900 break-all">
            ¥{totalSales.toLocaleString()}
          </p>
          {happTotalSales !== null && (
            <p className="text-xs text-blue-700 mt-0.5">全オーダー合計（キャンセル除外）</p>
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">本指名合計</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {totalRepeats}<span className="text-base font-normal text-slate-700 ml-1">回</span>
          </p>
        </div>
        <div className={`rounded-2xl p-4 md:p-5 shadow-sm ${criticalAlerts > 0 ? 'bg-red-50' : 'bg-white'}`}>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">要対応アラート</p>
          <p className={`mt-2 text-3xl font-bold ${criticalAlerts > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {criticalAlerts}<span className="text-base font-normal text-slate-700 ml-1">件</span>
          </p>
        </div>
      </section>

      {/* 最終同期状況 */}
      {happData?.lastSyncedAt && (
        <div className="flex items-center gap-3 text-sm text-slate-700 rounded-xl bg-white px-4 py-3 shadow-sm">
          <span className="text-green-600 font-bold">●</span>
          <span>最終同期：{new Date(happData.lastSyncedAt).toLocaleString('ja-JP')}</span>
          <span className="text-slate-400">·</span>
          <span>{orderCount.toLocaleString()}件保存済み</span>
          <Link href="/sync" className="ml-auto text-blue-700 hover:underline font-medium shrink-0">
            同期する →
          </Link>
        </div>
      )}

      {/* 来店アラート上位3件 */}
      <section className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">来店アラート（上位3件）</h2>
          <Link href="/alerts" className="text-sm font-medium text-blue-700 hover:underline px-2 py-1 -mr-2">
            すべて見る →
          </Link>
        </div>
        {happAlerts.length === 0 ? (
          <p className="text-sm text-slate-700">現在アラート対象の顧客はいません</p>
        ) : (
          <div className="space-y-3">
            {happAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.customer.id}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  alert.level === 'critical' ? 'border-red-200 bg-red-50' :
                  alert.level === 'warning'  ? 'border-yellow-200 bg-yellow-50' :
                                               'border-slate-200 bg-slate-50'
                }`}
              >
                <div>
                  <Link
                    href={`/customers/${alert.customer.id}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {alert.customer.name}
                  </Link>
                  <p className="text-sm text-slate-700 mt-0.5">最終来店：{alert.lastVisitDate}</p>
                </div>
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                  alert.level === 'critical' ? 'bg-red-100 text-red-800' :
                  alert.level === 'warning'  ? 'bg-yellow-100 text-yellow-800' :
                                               'bg-slate-200 text-slate-700'
                }`}>
                  {alert.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 記念日アラート上位3件 */}
      {anniversaryAlerts.length > 0 && (
        <section className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">記念日アラート（上位3件）</h2>
            <Link href="/anniversaries" className="text-sm font-medium text-blue-700 hover:underline px-2 py-1 -mr-2">
              すべて見る →
            </Link>
          </div>
          <div className="space-y-2">
            {anniversaryAlerts.map((a, i) => (
              <div key={i} className={`flex items-center justify-between rounded-xl border p-3 ${
                a.kind === 'birthday' ? 'border-pink-200 bg-pink-50' :
                a.kind === 'first_years' ? 'border-yellow-200 bg-yellow-50' :
                'border-blue-200 bg-blue-50'
              }`}>
                <div>
                  <Link href={`/customers/${a.customer.id}`} className="font-semibold text-slate-900 hover:underline text-sm">
                    {a.customer.name}
                  </Link>
                  <p className="text-xs text-slate-600 mt-0.5">{a.label} · {a.date}</p>
                </div>
                <span className="text-sm font-semibold text-slate-700 shrink-0 ml-3">
                  {a.daysUntil === 0 ? '今日' : `${a.daysUntil}日後`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 最近の来店顧客 */}
      <section className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">最近の来店顧客</h2>
            <p className="text-xs text-slate-600 mt-0.5">happ-s.com 実データ · 紐付き済みのみ</p>
          </div>
          <Link href="/customers" className="text-sm font-medium text-blue-700 hover:underline px-2 py-1 -mr-2">
            すべて見る →
          </Link>
        </div>

        {recentCustomers.length === 0 ? (
          <p className="text-sm text-slate-700">happ オーダーと紐付き済みの顧客がいません</p>
        ) : (
          <>
            <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">顧客名</th>
                    <th className="px-4 py-3">最終来店</th>
                    <th className="px-4 py-3">来店回数</th>
                    <th className="px-4 py-3">累計売上</th>
                    <th className="px-4 py-3">次回予約</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCustomers.map(({ customer, stats }) => (
                    <tr key={customer.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <Link href={`/customers/${customer.id}`} className="text-blue-700 hover:underline">
                          {customer.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{stats.lastVisitDate}</td>
                      <td className="px-4 py-3 text-slate-900">{stats.visitCount}回</td>
                      <td className="px-4 py-3 font-medium text-slate-900">¥{stats.completedAmount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {stats.nextReservation ? (() => {
                          const o = nextResMap.get(customer.id)
                          return o ? (
                            <OrderDetailDialog
                              triggerClassName="cursor-pointer"
                              order={{
                                orderId:       o.orderId,
                                customerName:  customer.name,
                                startTime:     o.startTime,
                                endTime:       o.endTime,
                                course:        o.course,
                                totalAmount:   o.totalAmount,
                                therapistFee:  o.therapistFee,
                                paymentMethod: o.paymentMethod,
                                status:        o.status || o.internalStatus,
                              }}
                              trigger={
                                <span className="font-medium text-green-800 underline decoration-dotted underline-offset-2">
                                  {stats.nextReservation}
                                </span>
                              }
                            />
                          ) : (
                            <span className="font-medium text-green-800">{stats.nextReservation}</span>
                          )
                        })() : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {recentCustomers.map(({ customer, stats }) => (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">{customer.name}</p>
                    <p className="text-sm text-slate-700">{stats.lastVisitDate}</p>
                  </div>
                  <div className="mt-2 flex gap-5 text-sm">
                    <span className="font-medium text-slate-900">¥{stats.completedAmount.toLocaleString()}</span>
                    <span className="text-slate-700">{stats.visitCount}回</span>
                    {stats.nextReservation && (
                      <span className="font-medium text-green-700">次回 {stats.nextReservation}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 今月の来店予測 */}
      <Link
        href={`/predictions?month=${today.slice(0, 7)}`}
        className="block rounded-2xl bg-blue-600 p-5 shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-100 uppercase tracking-wide">
              {today.slice(0, 4)}年{parseInt(today.slice(5, 7), 10)}月
            </p>
            <p className="text-lg md:text-xl font-bold text-white mt-1">今月の来店予測を見る</p>
            <p className="text-sm text-blue-200 mt-0.5">予測・実績・達成率を確認</p>
          </div>
          <span className="text-4xl shrink-0 opacity-80">📈</span>
        </div>
      </Link>

      {/* クイックナビゲーション */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">機能メニュー</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/orders"
            className="rounded-2xl bg-white p-4 md:p-5 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all group"
          >
            <p className="text-xl mb-2">📋</p>
            <p className="font-bold text-slate-900 group-hover:text-blue-700">外部オーダー</p>
            <p className="text-sm text-slate-700 mt-0.5">{orderCount.toLocaleString()}件 · 月別表示</p>
          </Link>
          <Link
            href="/candidates"
            className="rounded-2xl bg-white p-4 md:p-5 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all group"
          >
            <p className="text-xl mb-2">✨</p>
            <p className="font-bold text-slate-900 group-hover:text-blue-700">顧客登録候補</p>
            <p className="text-sm text-slate-700 mt-0.5">未登録 {candidateCount}名</p>
          </Link>
          <Link
            href="/sync"
            className="rounded-2xl bg-white p-4 md:p-5 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all group"
          >
            <p className="text-xl mb-2">↻</p>
            <p className="font-bold text-slate-900 group-hover:text-blue-700">同期 / 管理</p>
            <p className="text-sm text-slate-700 mt-0.5">happ-s.com データ同期</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
