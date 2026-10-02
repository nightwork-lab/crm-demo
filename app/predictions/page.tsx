import { getCustomers, getLinks, getOrders } from '../lib/repository'
import { getCustomerLifetimeStats, getMonthGrandTotal, getCustomerMonthActuals, getCustomerLastVisitDates } from '../lib/order-metrics'
import { formatMonthLabel } from '../lib/prediction'
import { getPredictions } from '../lib/repository/predictions'
import { getTarget } from '../lib/repository/monthly-targets'
import { prevMonthKey } from '../lib/prediction-utils'
import { isWriteBlocked } from '../lib/app-mode'
import MonthNav from '../ui/month-nav'
import MonthlyTargetInput from '../ui/monthly-target-input'
import PredictionSortList, { type PredictionRowData } from '../ui/prediction-sort-list'

type Props = { searchParams: Promise<{ month?: string }> }

export default async function PredictionsPage({ searchParams }: Props) {
  const { month } = await searchParams
  const today       = new Date().toISOString().slice(0, 7)
  const targetMonth = month ?? today
  const lastMonth   = prevMonthKey(targetMonth, 1)
  const readonly    = isWriteBlocked()

  const [customers, links, allOrders, predictions, monthlyTarget] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrders(),
    getPredictions(),
    getTarget(targetMonth),
  ])

  const grandTotal   = getMonthGrandTotal(allOrders, links, customers, targetMonth)
  const actualsMap   = getCustomerMonthActuals(allOrders, links, customers, targetMonth)
  const lastMonthMap = getCustomerMonthActuals(allOrders, links, customers, lastMonth)

  const allStatsMap       = getCustomerLifetimeStats(allOrders, links, customers)
  const lastVisitMap      = getCustomerLastVisitDates(allOrders, links, customers)
  const linkedCustomers   = customers.filter((c) => allStatsMap.has(c.id))

  const predMap = new Map(
    predictions
      .filter((p) => p.targetMonth === targetMonth)
      .map((p) => [p.customerId, p]),
  )

  const rows: PredictionRowData[] = linkedCustomers.map((c) => {
    const pred   = predMap.get(c.id)
    const actual = actualsMap.get(c.id)   ?? { visitCount: 0, amount: 0 }
    const lastMo = lastMonthMap.get(c.id) ?? { visitCount: 0, amount: 0 }
    return {
      customerId:       c.id,
      customerName:     c.name,
      lastMonthVisits:  lastMo.visitCount,
      lastMonthRevenue: lastMo.amount,
      actualVisits:     actual.visitCount,
      actualRevenue:    actual.amount,
      predictedVisits:  pred?.predictedVisits  ?? null,
      predictedRevenue: pred?.predictedRevenue ?? null,
      existingMemo:     pred?.memo ?? '',
      hasPrediction:    pred != null,
      lastVisitDate:    lastVisitMap.get(c.id) ?? null,
      tags:             c.tags ?? [],
      followUpStatus:   pred?.followUpStatus ?? null,
      predictionExclude: c.predictionExclude ?? null,
    }
  })

  // 除外中の顧客は通常リストから分離する（別セクションで「戻す」操作のみ可能にする）
  const activeRows   = rows.filter((r) => r.predictionExclude == null)
  const excludedRows = rows.filter((r) => r.predictionExclude != null)

  const totalPredRevenue = activeRows.reduce((s, r) => s + (r.predictedRevenue ?? 0), 0)

  const grandActRevenue = grandTotal.totalAmount
  const grandActVisits  = grandTotal.totalVisits
  const unlinkedRevenue = grandTotal.unlinkedAmount
  const unlinkedVisits  = grandTotal.unlinkedVisits

  const achieveRate = monthlyTarget != null
    ? Math.round((grandActRevenue / monthlyTarget.targetRevenue) * 100)
    : null

  const unpredictedCount = activeRows.filter((r) => !r.hasPrediction).length

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">来店予測管理</h1>
        <p className="text-sm text-slate-700 mt-1">
          {formatMonthLabel(targetMonth)} · 外部オーダー全件ベース
        </p>
      </header>

      <MonthNav currentMonth={targetMonth} basePath="/predictions" />

      {/* 月間目標売上 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">月間目標売上</p>
        <MonthlyTargetInput
          targetMonth={targetMonth}
          currentTarget={monthlyTarget?.targetRevenue ?? null}
          isReadonly={readonly}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm col-span-2 md:col-span-1">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">月全体実績売上</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            ¥{grandActRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{grandActVisits}件（外部オーダー全件）</p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">月全体予測売上</p>
          <p className="mt-2 text-xl font-bold text-slate-900">
            ¥{totalPredRevenue.toLocaleString()}
          </p>
        </div>

        <div className={`rounded-2xl p-4 shadow-sm ${
          achieveRate != null && achieveRate >= 100 ? 'bg-green-50' :
          achieveRate != null && achieveRate >= 70  ? 'bg-yellow-50' :
          achieveRate != null                       ? 'bg-red-50' : 'bg-white'
        }`}>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">達成率</p>
          <p className={`mt-2 text-2xl font-bold ${
            achieveRate == null ? 'text-slate-400' :
            achieveRate >= 100  ? 'text-green-700' :
            achieveRate >= 70   ? 'text-yellow-700' : 'text-red-700'
          }`}>
            {achieveRate != null ? `${achieveRate}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {achieveRate != null ? '月全体実績 / 目標' : '目標未設定'}
          </p>
        </div>

        <div className={`rounded-2xl p-4 shadow-sm ${unpredictedCount > 0 ? 'bg-orange-50' : 'bg-white'}`}>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">予測未入力</p>
          <p className={`mt-2 text-2xl font-bold ${unpredictedCount > 0 ? 'text-orange-700' : 'text-slate-900'}`}>
            {unpredictedCount}
            <span className="text-sm font-normal text-slate-700 ml-1">名</span>
          </p>
        </div>
      </div>

      {unlinkedRevenue > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">未紐付け / ID不明売上</p>
          <p className="mt-1 font-bold text-blue-800">
            ¥{unlinkedRevenue.toLocaleString()}
            <span className="text-sm font-normal text-slate-600 ml-2">{unlinkedVisits}件</span>
          </p>
        </div>
      )}

      {linkedCustomers.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-slate-700 font-medium">happ 紐付き済み顧客がいません</p>
        </div>
      ) : (
        <PredictionSortList
          rows={activeRows}
          excludedRows={excludedRows}
          targetMonth={targetMonth}
          isReadonly={readonly}
          unlinkedRevenue={unlinkedRevenue}
          unlinkedVisits={unlinkedVisits}
          grandActRevenue={grandActRevenue}
          grandActVisits={grandActVisits}
          totalPredRevenue={totalPredRevenue}
          achieveRate={achieveRate}
        />
      )}
    </div>
  )
}
