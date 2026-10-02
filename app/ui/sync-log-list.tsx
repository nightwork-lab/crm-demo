/**
 * 同期履歴の一覧（直近数件）。Server Component。
 * sync_logs は Supabase にのみ存在するため service_role で読む（このコンポーネントは
 * 管理者専用ページからのみ使うこと）。Supabase 未設定時は何も表示しない。
 */
import { createSupabaseServerClient } from '../lib/supabase-server'

type SyncLogRow = {
  synced_at:    string
  orders_total: number | null
  orders_new:   number | null
  source:       string | null
}

const SOURCE_LABELS: Record<string, string> = {
  mirror:  'ミラー反映',
  sync:    '通常同期',
  history: '履歴取得',
  import:  '初回インポート',
}

export default async function SyncLogList() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null

  let logs: SyncLogRow[] = []
  try {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('sync_logs')
      .select('synced_at,orders_total,orders_new,source')
      .order('synced_at', { ascending: false })
      .limit(8)
    logs = data ?? []
  } catch {
    return null
  }

  if (logs.length === 0) return null

  return (
    <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900 mb-4">同期履歴（直近）</h2>
      <div className="space-y-2">
        {logs.map((log, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0"
          >
            <span className="text-slate-700 whitespace-nowrap">
              {new Date(log.synced_at).toLocaleString('ja-JP', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 whitespace-nowrap">
              {SOURCE_LABELS[log.source ?? ''] ?? log.source ?? '—'}
            </span>
            <span className="text-slate-500 text-xs ml-auto whitespace-nowrap">
              {log.orders_total != null ? `${log.orders_total.toLocaleString()}件` : '—'}
              {log.orders_new != null && log.orders_new > 0 && (
                <span className="text-green-700 ml-1">+{log.orders_new}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
