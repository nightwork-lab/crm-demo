import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../lib/auth-context'
import { getAdminSummary } from '../lib/repository/admin'
import { formatMonthLabel } from '../lib/prediction'
import { startViewAsAction } from '../actions/admin-view'
import MonthNav from '../ui/month-nav'

type Props = { searchParams: Promise<{ month?: string }> }

function formatSyncTime(iso: string | null): string {
  if (!iso) return '未同期'
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminPage({ searchParams }: Props) {
  // 管理者専用（環境を問わず厳格に）
  if (!(await isAdmin())) redirect('/')

  const { month } = await searchParams
  const monthKey  = month ?? new Date().toISOString().slice(0, 7)
  const summary   = await getAdminSummary(monthKey)

  if (!summary) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-slate-700">Supabase 未設定のため表示できません。</p>
      </div>
    )
  }

  const errorRows = summary.therapists.filter((t) => t.lastSyncError)

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <header>
        <p className="text-sm text-slate-700">管理者</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">管理ダッシュボード</h1>
        <p className="text-sm text-slate-700 mt-1">
          {formatMonthLabel(summary.monthKey)} · 全セラピスト ·{' '}
          <Link href="/admin/members" className="text-blue-700 hover:underline font-medium">従業員管理 →</Link>
        </p>
      </header>

      <MonthNav currentMonth={summary.monthKey} basePath="/admin" />

      {/* 全体サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm col-span-2 md:col-span-1">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">全体売上（当月）</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            ¥{summary.totalAmount.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{summary.totalVisits}件 · キャンセル除外</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">登録セラピスト</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {summary.therapists.filter((t) => t.active).length}
            <span className="text-sm font-normal text-slate-700 ml-1">名</span>
          </p>
        </div>
        <div className={`rounded-2xl p-4 shadow-sm ${errorRows.length > 0 ? 'bg-red-50' : 'bg-white'}`}>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">同期エラー</p>
          <p className={`mt-2 text-2xl font-bold ${errorRows.length > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {errorRows.length}
            <span className="text-sm font-normal text-slate-700 ml-1">件</span>
          </p>
        </div>
      </div>

      {/* セラピスト別一覧 */}
      <section className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">セラピスト別</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">名前</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">当月売上</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">件数</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">最終同期</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">状態</th>
              </tr>
            </thead>
            <tbody>
              {summary.therapists.map((t) => (
                <tr key={t.therapistId} className="border-t border-slate-100">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {t.role === 'admin' ? (
                      <span className="font-semibold text-slate-900">{t.displayName}</span>
                    ) : (
                      <form action={startViewAsAction.bind(null, t.therapistId)} className="inline">
                        <button
                          type="submit"
                          className="font-semibold text-blue-700 hover:underline"
                          title="この従業員のデータを閲覧する"
                        >
                          {t.displayName}
                        </button>
                      </form>
                    )}
                    {t.role === 'admin' && (
                      <span className="ml-2 text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5">管理者</span>
                    )}
                    {t.happWorkerId == null && (
                      <span className="ml-2 text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">happ未対応付け</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                    ¥{t.monthAmount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{t.monthVisits}件</td>
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{formatSyncTime(t.lastSyncedAt)}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {!t.active ? (
                      <span className="text-xs rounded-full bg-slate-200 text-slate-500 px-2 py-1">停止中</span>
                    ) : t.lastSyncError ? (
                      <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-1">エラー</span>
                    ) : (
                      <span className="text-xs rounded-full bg-green-100 text-green-700 px-2 py-1">正常</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* エラー詳細（あれば） */}
      {errorRows.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 md:p-5">
          <h2 className="text-sm font-bold text-red-800 mb-2">同期エラーの内容</h2>
          <div className="space-y-1">
            {errorRows.map((t) => (
              <p key={t.therapistId} className="text-xs text-red-700 break-all">
                <strong>{t.displayName}:</strong> {t.lastSyncError}
              </p>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">
        <Link href="/sync" className="text-blue-700 hover:underline">同期 / 管理へ →</Link>
      </p>
    </div>
  )
}
