import { redirect } from 'next/navigation'
import { getOrdersFile } from '../lib/repository'
import { isFutureReservation } from '../lib/customer-stats'
import { isReadonlyMode, isVercelEnvironment } from '../lib/app-mode'
import { isAdmin } from '../lib/auth-context'
import SyncButton from '../ui/sync-button'
import HistorySyncButton from '../ui/history-sync-button'
import SyncLogList from '../ui/sync-log-list'

export default async function SyncPage() {
  // 同期・管理は管理者専用。本番（Vercel）では一般セラピストをトップへ戻す。
  // ローカル開発（Supabase 未設定時など）は従来通りアクセス可能。
  if (isVercelEnvironment() && !(await isAdmin())) {
    redirect('/')
  }

  const readonly = isReadonlyMode()
  const happData = await getOrdersFile()
  const orders   = happData?.orders ?? []
  const today    = new Date().toISOString().slice(0, 10)

  const sourceCounts = {
    orderList:       orders.filter((o) => o.source === 'orderList').length,
    orderListCash:   orders.filter((o) => o.source === 'orderListCash').length,
    uriageTherapist: orders.filter((o) => o.source === 'uriageTherapist').length,
  }
  const count2026     = orders.filter((o) => o.startTime.startsWith('2026')).length
  const upcomingCount = orders.filter((o) => isFutureReservation(o, today)).length

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">同期 / 管理</h1>
        <p className="text-sm text-slate-700 mt-1">
          happ-s.com からオーダーデータを取得します ·{' '}
          <a href="/admin" className="text-blue-700 hover:underline font-medium">管理ダッシュボード →</a>
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">happ 同期</h2>
        <SyncButton isReadonly={readonly} />
      </section>

      <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-1">月別履歴取得</h2>
        <p className="text-sm text-slate-600 mb-4">
          通常同期で取得できない過去月のオーダーを補完します。
        </p>
        <HistorySyncButton isReadonly={readonly} />
      </section>

      <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">保存済みデータ</h2>

        {!happData ? (
          <p className="text-sm text-slate-700">データがありません。同期を実行してください。</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">最終同期</p>
              <p className="mt-1 font-semibold text-slate-900">
                {new Date(happData.lastSyncedAt).toLocaleString('ja-JP')}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">合計</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {orders.length.toLocaleString()}
                  <span className="text-sm font-normal text-slate-700 ml-1">件</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">2026年</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {count2026.toLocaleString()}
                  <span className="text-sm font-normal text-slate-700 ml-1">件</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">今後の予約</p>
                <p className="mt-1 text-2xl font-bold text-green-700">
                  {upcomingCount}
                  <span className="text-sm font-normal text-slate-700 ml-1">件</span>
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">ソース別</p>
              <div className="space-y-2">
                {[
                  { label: 'orderList（通常）',           count: sourceCounts.orderList },
                  { label: 'orderListCash（現金）',        count: sourceCounts.orderListCash },
                  { label: 'uriageTherapist（売上集計）',  count: sourceCounts.uriageTherapist },
                ].map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm text-slate-700 min-w-0 flex-1 truncate">{label}</span>
                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden shrink-0">
                      <div
                        className="bg-slate-600 h-2 rounded-full"
                        style={{ width: orders.length > 0 ? `${(count / orders.length) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-900 w-14 text-right shrink-0">
                      {count.toLocaleString()}件
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <SyncLogList />
    </div>
  )
}
