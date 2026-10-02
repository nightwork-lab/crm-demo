/**
 * 顧客紐付けデータ読み取り。DATA_SOURCE に応じて JSON または Supabase から返す。
 * server side 専用。
 */
import { cache } from 'react'
import { getDataSource } from '../data-source'
import { getCachedLinks } from '../cache'
import { createSupabaseSessionClient } from '../supabase-server'
import type { CustomerLink } from '../customer-link'

export async function getLinks(): Promise<CustomerLink[]> {
  if (getDataSource() === 'supabase') {
    return loadFromSupabase()
  }
  return getCachedLinks()
}

// React cache(): 同一リクエスト内の重複取得を排除
const loadFromSupabase = cache(async (): Promise<CustomerLink[]> => {
  // セッションクライアント（RLS 適用）+ スコープ（本人 or 閲覧モードの対象者）
  const supabase = await createSupabaseSessionClient()
  if (!supabase) return []
  const { getScopedTherapistId } = await import('../admin-view')
  const scopeId = await getScopedTherapistId()
  if (!scopeId) return []
  const { data, error } = await supabase
    .from('customer_links')
    .select('happ_customer_id,crm_customer_id,linked_at,linked_by,note')
    .eq('therapist_id', scopeId)
  if (error) throw new Error(`customer_links: ${error.message}`)
  return (data ?? []).map((row) => ({
    happCustomerId: row.happ_customer_id,
    crmCustomerId:  row.crm_customer_id ?? '',
    linkedAt:       row.linked_at ?? '',
    linkedBy:       (row.linked_by ?? 'manual') as CustomerLink['linkedBy'],
    note:           row.note ?? undefined,
  }))
})
