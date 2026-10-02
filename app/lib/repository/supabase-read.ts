/**
 * Supabase 読み取り専用 repository。
 * 件数取得のみ。個人情報・金額明細は取得しない。
 * server側専用 — Client Component からインポートしないこと。
 */

import { createSupabaseServerClient } from '../supabase-server'

export type SupabaseCounts = {
  customers:      number | null
  happ_orders:    number | null
  customer_links: number | null
  sync_logs:      number | null
  error:          string | null
}

async function countTable(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) throw new Error(`[${table}] ${error.message}`)
  return count
}

export async function getSupabaseCounts(): Promise<SupabaseCounts> {
  try {
    const supabase = createSupabaseServerClient()
    const [customers, happ_orders, customer_links, sync_logs] = await Promise.all([
      countTable(supabase, 'customers'),
      countTable(supabase, 'happ_orders'),
      countTable(supabase, 'customer_links'),
      countTable(supabase, 'sync_logs'),
    ])
    return { customers, happ_orders, customer_links, sync_logs, error: null }
  } catch (err) {
    return {
      customers:      null,
      happ_orders:    null,
      customer_links: null,
      sync_logs:      null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function getSupabaseCustomersCount():  Promise<number | null> {
  const { customers, error } = await getSupabaseCounts()
  if (error) return null
  return customers
}

export async function getSupabaseOrdersCount():  Promise<number | null> {
  const { happ_orders, error } = await getSupabaseCounts()
  if (error) return null
  return happ_orders
}

export async function getSupabaseLinksCount():  Promise<number | null> {
  const { customer_links, error } = await getSupabaseCounts()
  if (error) return null
  return customer_links
}

export async function getSupabaseSyncLogsCount(): Promise<number | null> {
  const { sync_logs, error } = await getSupabaseCounts()
  if (error) return null
  return sync_logs
}
