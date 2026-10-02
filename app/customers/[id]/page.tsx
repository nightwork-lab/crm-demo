import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomerWithOrders } from '../../lib/customer-detail'
import OrderHistory from '../../ui/order-history'
import EditCustomerDialog from '../../ui/edit-customer-dialog'
import AlertExclusionPanel from '../../ui/alert-exclusion-panel'
import PredictionForm from '../../ui/prediction-form'
import { getCustomerPredictionContext } from '../../lib/prediction'
import { getPredictionFor } from '../../lib/repository/predictions'
import { getFirstVisitDateFromOrders, calcMeetingDuration } from '../../lib/anniversary'
import { getNextReservationOrder } from '../../lib/order-metrics'
import { isWriteBlocked } from '../../lib/app-mode'
import OrderDetailDialog from '../../ui/order-detail-dialog'

export default async function CustomerDetailPage(props: PageProps<'/customers/[id]'>) {
  const { id } = await props.params
  const today       = new Date().toISOString().slice(0, 10)
  const targetMonth = today.slice(0, 7)
  // 顧客データと予測は独立して取得できるため並列化する
  const [data, prediction] = await Promise.all([
    getCustomerWithOrders(id),
    getPredictionFor(id, targetMonth),
  ])
  if (!data) notFound()
  const readonly = isWriteBlocked()

  const { customer, linkedOrders, stats } = data
  const hasHappData = stats.totalOrderCount > 0
  const predContext = getCustomerPredictionContext(linkedOrders, targetMonth)

  const firstVisitDate = getFirstVisitDateFromOrders(linkedOrders)
  const meetingDuration = firstVisitDate ? calcMeetingDuration(firstVisitDate, today) : null

  // 次回予約のオーダー実体（バッジのタップ詳細に使う）
  const nextResOrder = getNextReservationOrder(linkedOrders, today)

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      {/* パンくず */}
      <nav>
        <Link href="/customers" className="text-sm font-medium text-blue-700 hover:underline">
          ← 顧客一覧
        </Link>
      </nav>

      {/* 顧客基本情報 */}
      <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
              {customer.tags?.map((tag) => (
                <span key={tag} className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {tag}
                </span>
              ))}
              {customer.alertExcluded && (
                <span className="rounded-full bg-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  アラート除外中
                </span>
              )}
            </div>
            {customer.memo && (
              <p className="text-sm text-slate-700 max-w-xl whitespace-pre-wrap">{customer.memo}</p>
            )}
            <div className="pt-1 space-y-2">
              <EditCustomerDialog customer={customer} isReadonly={readonly} />
              <AlertExclusionPanel customer={customer} isReadonly={readonly} />
            </div>
          </div>

          {/* 次回予約バッジ（happ優先 → CRM手入力の順）。オーダー実体があればタップで詳細 */}
          {(stats.nextReservation ?? customer.nextReservation) && (
            nextResOrder ? (
              <OrderDetailDialog
                triggerClassName="shrink-0 text-left cursor-pointer"
                order={{
                  orderId:       nextResOrder.orderId,
                  customerName:  customer.name,
                  startTime:     nextResOrder.startTime,
                  endTime:       nextResOrder.endTime,
                  course:        nextResOrder.course,
                  totalAmount:   nextResOrder.totalAmount,
                  therapistFee:  nextResOrder.therapistFee,
                  paymentMethod: nextResOrder.paymentMethod,
                  status:        nextResOrder.status || nextResOrder.internalStatus,
                }}
                trigger={
                  <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center hover:bg-green-100 transition-colors">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">次回予約</p>
                    <p className="mt-1 font-bold text-green-900">{stats.nextReservation}</p>
                    <p className="mt-0.5 text-xs text-green-600">タップで詳細</p>
                  </div>
                }
              />
            ) : (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center shrink-0">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">次回予約</p>
                <p className="mt-1 font-bold text-green-900">
                  {stats.nextReservation ?? customer.nextReservation}
                </p>
                {stats.nextReservation && (
                  <p className="mt-0.5 text-xs text-green-600">happ 自動取得</p>
                )}
              </div>
            )
          )}
        </div>

        {/* 統計グリッド */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-slate-100">

          {/* 最終来店 */}
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">最終来店</p>
            {hasHappData && stats.lastVisitDate ? (
              <>
                <p className="mt-1 font-bold text-slate-900">{stats.lastVisitDate}</p>
                <p className="text-xs text-blue-700 mt-0.5">happ 自動</p>
              </>
            ) : (
              <p className="mt-1 font-bold text-slate-900">{customer.lastVisit}</p>
            )}
          </div>

          {/* 累計売上 */}
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">累計売上</p>
            {hasHappData ? (
              <>
                <p className="mt-1 font-bold text-slate-900">¥{stats.completedAmount.toLocaleString()}</p>
                <p className="text-xs text-blue-700 mt-0.5">happ 自動（実施済み）</p>
              </>
            ) : (
              <p className="mt-1 font-bold text-slate-900">¥{customer.totalSales.toLocaleString()}</p>
            )}
          </div>

          {/* 来店回数 */}
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">来店回数</p>
            {hasHappData ? (
              <>
                <p className="mt-1 font-bold text-slate-900">{stats.visitCount}<span className="text-base font-normal text-slate-700 ml-1">回</span></p>
                <p className="text-xs text-blue-700 mt-0.5">happ 自動</p>
              </>
            ) : (
              <p className="mt-1 font-bold text-slate-900">{customer.repeatCount}<span className="text-base font-normal text-slate-700 ml-1">回</span></p>
            )}
          </div>

          {/* ギャラ合計（happ連携時のみ） */}
          {hasHappData ? (
            <div>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">ギャラ合計</p>
              <p className="mt-1 font-bold text-slate-900">¥{stats.completedFee.toLocaleString()}</p>
              <p className="text-xs text-blue-700 mt-0.5">happ 自動</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">本指名（CRM）</p>
              <p className="mt-1 font-bold text-slate-900">{customer.repeatCount}<span className="text-base font-normal text-slate-700 ml-1">回</span></p>
            </div>
          )}
        </div>

        {/* 初回予約日・誕生日 */}
        {(firstVisitDate || customer.birthday) && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-6 text-sm">
            {firstVisitDate && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">初回予約日</p>
                <p className="mt-0.5 font-semibold text-slate-900">{firstVisitDate}</p>
                {meetingDuration && (
                  <p className="text-xs text-blue-700 mt-0.5">出会って {meetingDuration.label}</p>
                )}
              </div>
            )}
            {customer.birthday && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">誕生日</p>
                <p className="mt-0.5 font-semibold text-slate-900">{customer.birthday}</p>
              </div>
            )}
          </div>
        )}

        {/* CRM手入力値との差分表示（happ連携済みの場合のみ） */}
        {hasHappData && (customer.totalSales > 0 || customer.repeatCount > 0) && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">CRM 手入力値（参考）</p>
            <div className="flex gap-6 text-sm text-slate-500">
              {customer.totalSales > 0 && (
                <span>売上: ¥{customer.totalSales.toLocaleString()}</span>
              )}
              {customer.repeatCount > 0 && (
                <span>本指名: {customer.repeatCount}回</span>
              )}
              {customer.lastVisit && (
                <span>最終来店: {customer.lastVisit}</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* happ 連携サマリー */}
      {hasHappData && (
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">全オーダー</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats.totalOrderCount}<span className="text-base font-normal text-slate-700 ml-1">件</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">実施済み</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats.visitCount}<span className="text-base font-normal text-slate-700 ml-1">件</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">次回予定</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats.totalOrderCount - stats.visitCount}<span className="text-base font-normal text-slate-700 ml-1">件</span>
            </p>
          </div>
        </section>
      )}

      {/* 今月予測 */}
      {hasHappData && (
        <section className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">今月予測</h2>
              <p className="text-sm text-slate-700 mt-0.5">
                {new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'long' })}
              </p>
            </div>
            <a
              href="/predictions"
              className="text-sm font-medium text-blue-700 hover:underline px-2 py-1 -mr-2"
            >
              月別一覧 →
            </a>
          </div>
          <PredictionForm
            customerId={customer.id}
            targetMonth={targetMonth}
            prediction={prediction}
            context={predContext}
            isReadonly={readonly}
          />
        </section>
      )}

      {/* 来店履歴 */}
      <section className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">来店履歴（happ-s.com）</h2>
            <p className="text-sm text-slate-700 mt-0.5">
              紐付き済みオーダー {stats.totalOrderCount}件 ・ 新しい順
            </p>
          </div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            happ-s.com
          </span>
        </div>
        <OrderHistory orders={linkedOrders} />
      </section>
    </div>
  )
}
