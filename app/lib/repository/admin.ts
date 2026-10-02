/**
 * 管理者専用のデータ取得。全セラピスト横断の集計を行う。
 *
 * - セッションクライアント（RLS 適用）で読む。admin ロールのポリシーにより
 *   全セラピストの行が返る。service_role は使わない（権限昇格を避ける）。
 * - DATA_SOURCE に関わらず Supabase を直接読む（ミラー反映後の状態が正）。
 * server side 専用。
 */
import { cache } from 'react'
import { createSupabaseSessionClient } from '../supabase-server'

export type AdminTherapistRow = {
  therapistId:  string
  displayName:  string
  role:         string
  active:       boolean
  happWorkerId: number | null
  monthAmount:  number
  monthVisits:  number
  lastSyncedAt: string | null
  lastSyncError: string | null
}

export type AdminSummary = {
  monthKey:    string
  totalAmount: number
  totalVisits: number
  therapists:  AdminTherapistRow[]
}

type OrderRow = {
  therapist_id:    string
  start_time:      string
  total_amount:    number
  status:          string
  internal_status: string
}

function isCanceled(o: OrderRow): boolean {
  return o.status === 'キャンセル' || o.internal_status === 'キャンセル'
}

/** 月キー "YYYY-MM" のオーダーか（"/" と "-" 両形式対応）。 */
function inMonth(startTime: string, monthKey: string): boolean {
  return startTime.slice(0, 7).replace(/\//g, '-') === monthKey
}

export const getAdminSummary = cache(async (monthKey: string): Promise<AdminSummary | null> => {
  const supabase = await createSupabaseSessionClient()
  if (!supabase) return null

  // セラピスト一覧（admin ポリシーで全員分）
  const { data: therapists, error: tErr } = await supabase
    .from('therapists')
    .select('id, display_name, role, active, happ_worker_id')
    .order('role')
  if (tErr) throw new Error(`therapists: ${tErr.message}`)

  // 当月オーダー（therapist_id 付き・ページネーション）
  const monthPrefixSlash  = monthKey.replace('-', '/')
  const PAGE = 1000
  const orders: OrderRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('happ_orders')
      .select('therapist_id,start_time,total_amount,status,internal_status')
      .or(`start_time.like.${monthPrefixSlash}%,start_time.like.${monthKey}%`)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`happ_orders: ${error.message}`)
    orders.push(...((data ?? []) as OrderRow[]))
    if (!data || data.length < PAGE) break
  }

  // 最終同期（セラピスト別・sync_logs は admin のみ読める）
  const { data: logs } = await supabase
    .from('sync_logs')
    .select('therapist_id, synced_at, error_message')
    .order('synced_at', { ascending: false })
    .limit(200)

  const lastSyncMap  = new Map<string, { at: string; error: string | null }>()
  for (const log of logs ?? []) {
    const key = log.therapist_id ? String(log.therapist_id) : ''
    if (key && !lastSyncMap.has(key)) {
      lastSyncMap.set(key, { at: log.synced_at, error: log.error_message ?? null })
    }
  }

  // セラピスト別集計
  const byTherapist = new Map<string, { amount: number; visits: number }>()
  let totalAmount = 0, totalVisits = 0
  for (const o of orders) {
    if (!inMonth(o.start_time, monthKey) || isCanceled(o)) continue
    const cur = byTherapist.get(o.therapist_id) ?? { amount: 0, visits: 0 }
    cur.amount += o.total_amount ?? 0
    cur.visits++
    byTherapist.set(o.therapist_id, cur)
    totalAmount += o.total_amount ?? 0
    totalVisits++
  }

  const rows: AdminTherapistRow[] = (therapists ?? []).map((t) => {
    const id   = String(t.id)
    const agg  = byTherapist.get(id) ?? { amount: 0, visits: 0 }
    const sync = lastSyncMap.get(id)
    return {
      therapistId:   id,
      displayName:   String(t.display_name),
      role:          String(t.role),
      active:        Boolean(t.active),
      happWorkerId:  t.happ_worker_id ?? null,
      monthAmount:   agg.amount,
      monthVisits:   agg.visits,
      lastSyncedAt:  sync?.at ?? null,
      lastSyncError: sync?.error ?? null,
    }
  })

  return { monthKey, totalAmount, totalVisits, therapists: rows }
})
