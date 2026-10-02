import Link from 'next/link'
import { getCustomers, getLinks, getOrders } from '../lib/repository'
import {
  getMonthGrandTotal,
  getCustomerMonthActuals,
  getCustomerLifetimeStats,
  getCustomerFirstVisitDates,
  getMonthFeeStats,
  isMonthOrder,
  isCanceledOrder,
} from '../lib/order-metrics'
import { formatMonthLabel } from '../lib/prediction'
import { getPredictions } from '../lib/repository/predictions'
import { getTarget } from '../lib/repository/monthly-targets'
import { prevMonthKey } from '../lib/prediction-utils'
import { isWriteBlocked } from '../lib/app-mode'
import MonthNav from '../ui/month-nav'
import MonthlyTargetInput from '../ui/monthly-target-input'
import MonthlyDailyChart, { type DayData } from '../ui/monthly-daily-chart'
import MonthlyRankList, { type RankRow } from '../ui/monthly-rank-list'

type Props = { searchParams: Promise<{ month?: string }> }

export default async function MonthlySummaryPage({ searchParams }: Props) {
  const { month } = await searchParams
  const today       = new Date().toISOString().slice(0, 7)
  const targetMonth = month ?? today
  const lastMonth   = prevMonthKey(targetMonth, 1)

  const [customers, links, allOrders, predictions, monthlyTarget] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrders(),
    getPredictions(),
    getTarget(targetMonth),
  ])
  const readonly      = isWriteBlocked()

  // ── 集計 ────────────────────────────────────────────────────────

  const grandTotal      = getMonthGrandTotal(allOrders, links, customers, targetMonth)
  const lastMonthGrand  = getMonthGrandTotal(allOrders, links, customers, lastMonth)
  const feeStats        = getMonthFeeStats(allOrders, targetMonth)
  const actualsMap      = getCustomerMonthActuals(allOrders, links, customers, targetMonth)
  const allStatsMap     = getCustomerLifetimeStats(allOrders, links, customers)

  // 初指名: 対象月が初回来店だった顧客（JSON: "YYYY/MM/…" / Supabase: "YYYY-MM-…" 両対応）
  const firstVisitMap = getCustomerFirstVisitDates(allOrders, links, customers)
  const isFirstDesignation = (customerId: string): boolean => {
    const fv = firstVisitMap.get(customerId)
    return fv != null && fv.slice(0, 7).replace('/', '-') === targetMonth
  }
  const firstDesignationCount =
    [...firstVisitMap.keys()].filter(isFirstDesignation).length

  // 初指名一覧（初来店日の早い順）。登録済み顧客のみ対象
  // 本指名 = 指名が2回以上（キャンセル・仮予約を除く。今後の予約も含む）
  const firstDesignationRows = customers
    .filter((c) => isFirstDesignation(c.id))
    .map((c) => {
      const actual         = actualsMap.get(c.id)
      const lifetimeVisits = allStatsMap.get(c.id)?.visitCount ?? 0
      return {
        id:         c.id,
        name:       c.name,
        firstVisit: firstVisitMap.get(c.id)!,
        amount:     actual?.amount ?? 0,
        visits:     actual?.visitCount ?? 0,
        isRepeat:   lifetimeVisits >= 2,
        lifetimeVisits,
      }
    })
    .sort((a, b) => a.firstVisit.localeCompare(b.firstVisit))
  const repeatCount = firstDesignationRows.filter((r) => r.isRepeat).length

  // "YYYY/MM/DD HH:mm" / "YYYY-MM-DD…" → "M/D" 表示
  const fmtFirstVisitDay = (s: string) => {
    const [, m, d] = s.slice(0, 10).replace(/\//g, '-').split('-')
    return `${Number(m)}/${Number(d)}`
  }

  // 予測
  const predMap = new Map(
    predictions
      .filter((p) => p.targetMonth === targetMonth)
      .map((p) => [p.customerId, p]),
  )
  const totalPredRevenue = [...predMap.values()].reduce((s, p) => s + p.predictedRevenue, 0)
  const totalPredVisits  = [...predMap.values()].reduce((s, p) => s + p.predictedVisits, 0)

  // KPI
  const avgAmount  = grandTotal.totalVisits > 0
    ? Math.round(grandTotal.totalAmount / grandTotal.totalVisits)
    : 0
  const achieveRate = monthlyTarget != null
    ? Math.round((grandTotal.totalAmount / monthlyTarget.targetRevenue) * 100)
    : null
  const grandDiff = totalPredRevenue > 0
    ? grandTotal.totalAmount - totalPredRevenue
    : null

  // 先月比
  const momRevPct = lastMonthGrand.totalAmount > 0
    ? Math.round(((grandTotal.totalAmount - lastMonthGrand.totalAmount) / lastMonthGrand.totalAmount) * 100)
    : null
  const momVisitsPct = lastMonthGrand.totalVisits > 0
    ? Math.round(((grandTotal.totalVisits - lastMonthGrand.totalVisits) / lastMonthGrand.totalVisits) * 100)
    : null

  // 未紐付け比率
  const unlinkedRatio = grandTotal.totalAmount > 0
    ? Math.round((grandTotal.unlinkedAmount / grandTotal.totalAmount) * 100)
    : 0

  // ── 日別データ ──────────────────────────────────────────────────

  const dailyMap = new Map<string, { amount: number; visits: number }>()
  for (const order of allOrders) {
    if (!isMonthOrder(order, targetMonth)) continue
    if (isCanceledOrder(order)) continue
    const day = order.startTime.slice(0, 10).replace(/\//g, '-')
    const cur = dailyMap.get(day) ?? { amount: 0, visits: 0 }
    cur.amount += order.totalAmount
    cur.visits++
    dailyMap.set(day, cur)
  }
  const dailyData: DayData[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }))

  // ── 顧客別ランキング ────────────────────────────────────────────

  const rankRows: RankRow[] = customers
    .filter((c) => actualsMap.has(c.id) && allStatsMap.has(c.id))
    .map((c) => {
      const actual = actualsMap.get(c.id)!
      const pred   = predMap.get(c.id)
      return {
        customerId:       c.id,
        customerName:     c.name,
        revenue:          actual.amount,
        visits:           actual.visitCount,
        avgAmount:        actual.visitCount > 0 ? Math.round(actual.amount / actual.visitCount) : 0,
        predictedRevenue: pred?.predictedRevenue ?? null,
        diff:             pred != null ? actual.amount - pred.predictedRevenue : null,
        isFirstDesignation: isFirstDesignation(c.id),
      }
    })

  // ── ヘルパー ────────────────────────────────────────────────────

  function MomBadge({ pct }: { pct: number | null }) {
    if (pct == null) return null
    return (
      <p className={`text-xs mt-0.5 font-semibold ${pct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
        {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% 先月比
      </p>
    )
  }

  // ── 描画 ────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <header>
        <p className="text-sm text-slate-700">分析</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">月次まとめ</h1>
        <p className="text-sm text-slate-700 mt-1">
          {formatMonthLabel(targetMonth)} · 外部オーダー全件ベース
        </p>
      </header>

      <MonthNav currentMonth={targetMonth} basePath="/monthly-summary" />

      {/* KPI カード ── 月間実績 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">月間実績</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm col-span-2 md:col-span-1">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">オーダー合計</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              ¥{grandTotal.totalAmount.toLocaleString()}
            </p>
            <MomBadge pct={momRevPct} />
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">オーダー件数</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {grandTotal.totalVisits}
              <span className="text-sm font-normal text-slate-600 ml-1">件</span>
            </p>
            <MomBadge pct={momVisitsPct} />
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">平均単価</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              ¥{avgAmount.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">全件平均</p>
          </div>
          <div className={`rounded-2xl p-4 shadow-sm ${firstDesignationCount > 0 ? 'bg-rose-50' : 'bg-white'}`}>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">初指名</p>
            <p className={`mt-2 text-2xl font-bold ${firstDesignationCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {firstDesignationCount}
              <span className="text-sm font-normal text-slate-600 ml-1">名</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">この月が初来店の顧客</p>
          </div>
        </div>
      </div>

      {/* KPI カード ── 売上内訳 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">売上内訳</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">紐付きオーダー合計</p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              ¥{grandTotal.linkedAmount.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{grandTotal.linkedVisits}件（紐付き顧客）</p>
          </div>
          <div className={`rounded-2xl p-4 shadow-sm ${grandTotal.unlinkedAmount > 0 ? 'bg-blue-50' : 'bg-white'}`}>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">未紐付けオーダー合計</p>
            <p className={`mt-2 text-xl font-bold ${grandTotal.unlinkedAmount > 0 ? 'text-blue-800' : 'text-slate-900'}`}>
              ¥{grandTotal.unlinkedAmount.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {grandTotal.unlinkedVisits}件 · 全体の{unlinkedRatio}%
            </p>
          </div>
        </div>
      </div>

      {/* KPI カード ── 費用内訳 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">費用内訳</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">店落ち</p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              ¥{feeStats.tenOchi.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">オーダー合計 − ギャラ</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">ギャラ</p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              ¥{feeStats.therapistFee.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">セラピスト分</p>
          </div>
        </div>
      </div>

      {/* KPI カード ── 予測比較 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">予測との比較</p>
        <div className="rounded-2xl bg-white p-4 shadow-sm mb-3">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">月間目標売上</p>
          <MonthlyTargetInput
            targetMonth={targetMonth}
            currentTarget={monthlyTarget?.targetRevenue ?? null}
            isReadonly={readonly}
          />
        </div>
        {totalPredRevenue === 0 ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">この月の予測データが未入力です。</p>
            <Link href={`/predictions?month=${targetMonth}`} className="text-sm text-blue-700 hover:underline font-medium mt-1 block">
              → 来店予測を入力する
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">予測売上</p>
                <p className="mt-1 text-lg font-bold text-slate-900">¥{totalPredRevenue.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{totalPredVisits}回</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">月間オーダー合計</p>
                <p className="mt-1 text-lg font-bold text-slate-900">¥{grandTotal.totalAmount.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{grandTotal.totalVisits}件</p>
              </div>
              <div className={`rounded-xl p-3 ${
                grandDiff != null && grandDiff >= 0 ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">差分</p>
                <p className={`mt-1 text-lg font-bold ${
                  grandDiff == null ? 'text-slate-400' :
                  grandDiff >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {grandDiff == null ? '—' :
                    grandDiff >= 0
                      ? `+¥${grandDiff.toLocaleString()}`
                      : `-¥${Math.abs(grandDiff).toLocaleString()}`}
                </p>
                <p className="text-xs text-slate-500">実績 − 予測</p>
              </div>
              <div className={`rounded-xl p-3 ${
                achieveRate != null && achieveRate >= 100 ? 'bg-green-50' :
                achieveRate != null && achieveRate >= 70  ? 'bg-yellow-50' :
                achieveRate != null ? 'bg-red-50' : 'bg-white'
              }`}>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">達成率</p>
                <p className={`mt-1 text-2xl font-bold ${
                  achieveRate == null ? 'text-slate-400' :
                  achieveRate >= 100  ? 'text-green-700' :
                  achieveRate >= 70   ? 'text-yellow-700' : 'text-red-700'
                }`}>
                  {achieveRate != null ? `${achieveRate}%` : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {achieveRate != null ? '実績 / 目標' : '目標未設定'}
                </p>
              </div>
            </div>

            {/* 予測 vs 実績 バー比較 */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>予測売上</span>
                  <span>¥{totalPredRevenue.toLocaleString()}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>月間オーダー合計</span>
                  <span>¥{grandTotal.totalAmount.toLocaleString()}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      grandTotal.totalAmount >= totalPredRevenue ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${Math.min((grandTotal.totalAmount / totalPredRevenue) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 日別推移グラフ */}
      <MonthlyDailyChart data={dailyData} />

      {/* 顧客別ランキング */}
      <MonthlyRankList rows={rankRows} targetMonth={targetMonth} />

      {/* 初指名一覧 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2 flex-wrap">
          初指名一覧
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            firstDesignationRows.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {firstDesignationRows.length}名
          </span>
          {firstDesignationRows.length > 0 && (
            <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-bold">
              本指名 {repeatCount}名
            </span>
          )}
        </h2>
        {firstDesignationRows.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">この月の初指名はありません</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {firstDesignationRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Link
                      href={`/customers/${r.id}`}
                      className="text-sm font-semibold text-blue-700 hover:underline truncate"
                    >
                      {r.name}
                    </Link>
                    {r.isRepeat ? (
                      <span className="shrink-0 rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                        本指名
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                        初回のみ
                      </span>
                    )}
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    初来店 {fmtFirstVisitDay(r.firstVisit)}
                    {r.isRepeat && ` · 累計${r.lifetimeVisits}回`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900">¥{r.amount.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">当月 {r.visits}回</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 先月との比較 サマリ */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-3">先月との比較</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">{formatMonthLabel(targetMonth)} オーダー合計</p>
            <p className="font-bold text-slate-900 mt-0.5">¥{grandTotal.totalAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{formatMonthLabel(lastMonth)} オーダー合計</p>
            <p className="font-bold text-slate-900 mt-0.5">¥{lastMonthGrand.totalAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{formatMonthLabel(targetMonth)} 来店数</p>
            <p className="font-bold text-slate-900 mt-0.5">{grandTotal.totalVisits}件</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{formatMonthLabel(lastMonth)} 来店数</p>
            <p className="font-bold text-slate-900 mt-0.5">{lastMonthGrand.totalVisits}件</p>
          </div>
        </div>
        {momRevPct != null && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            momRevPct >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            オーダー合計 前月比: {momRevPct >= 0 ? '▲' : '▼'} {Math.abs(momRevPct)}%
            {momVisitsPct != null && (
              <span className="ml-4">
                来店数前月比: {momVisitsPct >= 0 ? '▲' : '▼'} {Math.abs(momVisitsPct)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* ナビリンク */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`/predictions?month=${targetMonth}`} className="text-blue-700 hover:underline font-medium">
          → 来店予測ページ
        </Link>
        <Link href="/customers" className="text-blue-700 hover:underline font-medium">
          → 顧客一覧
        </Link>
      </div>
    </div>
  )
}
