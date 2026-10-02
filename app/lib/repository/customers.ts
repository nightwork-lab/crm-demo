/**
 * 顧客データ読み取り。DATA_SOURCE に応じて JSON または Supabase から返す。
 * server side 専用。
 */
import { cache } from 'react'
import { getDataSource } from '../data-source'
import { getCachedCustomers } from '../cache'
import { createSupabaseSessionClient } from '../supabase-server'
import type { Customer } from '../data'

export async function getCustomers(): Promise<Customer[]> {
  if (getDataSource() === 'supabase') {
    return loadFromSupabase()
  }
  return getCachedCustomers()
}

// React cache(): 同一リクエスト内の重複取得を排除
const loadFromSupabase = cache(async (): Promise<Customer[]> => {
  // セッションクライアント（RLS 適用）+ スコープ（本人 or 閲覧モードの対象者）
  const supabase = await createSupabaseSessionClient()
  if (!supabase) return []
  const { getScopedTherapistId, getAdminViewAs } = await import('../admin-view')
  const scopeId = await getScopedTherapistId()
  if (!scopeId) return []
  // 閲覧モード（運営が他セラピストのデータを見ている間）は私的メモを渡さない
  const hideMemo = (await getAdminViewAs()) !== null
  const { data, error } = await supabase
    .from('customers')
    .select('id,name,memo,tags,last_visit,total_sales,repeat_count,alert_excluded,alert_exclude_reason,birthday,anniversary_excluded,next_reservation,prediction_exclude,updated_at')
    .eq('therapist_id', scopeId)
    .order('id')
  if (error) throw new Error(`customers: ${error.message}`)
  return (data ?? []).map((row) => ({
    id:                   String(row.id),
    name:                 row.name ?? '',
    memo:                 hideMemo ? '' : (row.memo ?? ''),
    tags:                 Array.isArray(row.tags) ? row.tags : [],
    lastVisit:            row.last_visit ?? '',
    totalSales:           row.total_sales ?? 0,
    repeatCount:          row.repeat_count ?? 0,
    nextReservation:      row.next_reservation ?? undefined,
    alertExcluded:        row.alert_excluded ?? false,
    alertExcludeReason:   row.alert_exclude_reason ?? undefined,
    birthday:             row.birthday ?? undefined,
    anniversaryExcluded:  row.anniversary_excluded ?? false,
    predictionExclude:    row.prediction_exclude ?? undefined,
    updatedAt:            row.updated_at ?? undefined,
  }))
})
