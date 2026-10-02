import { redirect } from 'next/navigation'
import { getSupabaseCounts } from '../lib/repository/supabase-read'
import { getCachedCustomers, getCachedLinks, getCachedHappOrdersFile } from '../lib/cache'
import { isVercelEnvironment } from '../lib/app-mode'
import { isAdmin } from '../lib/auth-context'

type RowProps = {
  label:       string
  json:        number
  supabase:    number | null
  connected:   boolean
}

function CountRow({ label, json, supabase, connected }: RowProps) {
  const match   = connected && supabase === json
  const status  = !connected ? '—' : match ? '✓ 一致' : '✗ 不一致'
  const statusCls = !connected
    ? 'text-slate-400'
    : match
      ? 'text-green-700 font-semibold'
      : 'text-red-700 font-semibold'

  return (
    <tr className="border-t border-slate-100">
      <td className="py-3 px-4 text-sm font-mono text-slate-700">{label}</td>
      <td className="py-3 px-4 text-sm text-right font-semibold text-slate-900">
        {json.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-sm text-right font-semibold text-slate-900">
        {supabase != null ? supabase.toLocaleString() : '—'}
      </td>
      <td className={`py-3 px-4 text-sm text-center ${statusCls}`}>{status}</td>
    </tr>
  )
}

export default async function SupabaseCheckPage() {
  // 内部確認用ページ。本番では管理者専用。
  if (isVercelEnvironment() && !(await isAdmin())) {
    redirect('/')
  }

  const [sb, customers, links, happData] = await Promise.all([
    getSupabaseCounts(),
    Promise.resolve(getCachedCustomers()),
    Promise.resolve(getCachedLinks()),
    Promise.resolve(getCachedHappOrdersFile()),
  ])

  const connected = sb.error === null
  const jsonCounts = {
    customers:      customers.length,
    happ_orders:    happData?.orders.length ?? 0,
    customer_links: links.length,
  }

  const allMatch = connected
    && sb.customers      === jsonCounts.customers
    && sb.happ_orders    === jsonCounts.happ_orders
    && sb.customer_links === jsonCounts.customer_links

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <header>
        <p className="text-sm text-slate-500">管理 / 検証</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">Supabase 読み取り検証</h1>
        <p className="text-sm text-slate-500 mt-1">
          既存画面は引き続き JSON 読み取り。このページは確認専用です。
        </p>
      </header>

      {/* 接続状態 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-3">接続状態</h2>
        {connected ? (
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <span>●</span>
            <span>Supabase 接続OK</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-700 font-semibold">
              <span>●</span>
              <span>接続エラー</span>
            </div>
            <p className="text-sm text-red-600 font-mono bg-red-50 rounded-lg px-3 py-2">
              {sb.error}
            </p>
          </div>
        )}
      </section>

      {/* 件数比較 */}
      <section className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">件数比較</h2>
          {connected && (
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
              allMatch
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {allMatch ? '全件 一致' : '不一致あり'}
            </span>
          )}
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">テーブル</th>
              <th className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">JSON</th>
              <th className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Supabase</th>
              <th className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">照合</th>
            </tr>
          </thead>
          <tbody>
            <CountRow
              label="customers"
              json={jsonCounts.customers}
              supabase={sb.customers}
              connected={connected}
            />
            <CountRow
              label="happ_orders"
              json={jsonCounts.happ_orders}
              supabase={sb.happ_orders}
              connected={connected}
            />
            <CountRow
              label="customer_links"
              json={jsonCounts.customer_links}
              supabase={sb.customer_links}
              connected={connected}
            />
          </tbody>
        </table>
      </section>

      {/* sync_logs */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-3">sync_logs</h2>
        {!connected ? (
          <p className="text-sm text-slate-400">接続エラーのため取得不可</p>
        ) : (sb.sync_logs ?? 0) >= 1 ? (
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <span>✓</span>
            <span>{sb.sync_logs} 件記録済み</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-yellow-700 font-semibold">
            <span>⚠</span>
            <span>0 件（import実行後に記録されます）</span>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400 text-center">
        このページはデータを表示しません。件数のみ確認できます。
      </p>
    </div>
  )
}
