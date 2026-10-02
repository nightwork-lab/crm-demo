/**
 * オーダーデータ読み取り。DATA_SOURCE に応じて JSON または Supabase から返す。
 * Supabase 読み取りは React cache() で同一リクエスト内の重複取得を排除する。
 * server side 専用。
 */
import { cache } from 'react'
import { getDataSource } from '../data-source'
import { getCachedHappOrdersFile, getCachedOrders } from '../cache'
import { createSupabaseServerClient, createSupabaseSessionClient } from '../supabase-server'
import type { HappOrder, HappOrdersFile } from '../happ-order'

export async function getOrders(): Promise<HappOrder[]> {
  if (getDataSource() === 'supabase') {
    return loadOrdersFromSupabase()
  }
  return getCachedOrders()
}

/**
 * 指定した happ 顧客IDのオーダーだけを返す。
 *
 * 顧客詳細は表示に数件しか使わないのに全1386件を読んでいたため用意した。
 * 紐付けは customer-link.ts の resolveOrderCustomer が
 * links の happCustomerId 一致のみで判定しており（名前一致は誤紐付け防止のため使わない）、
 * customer_id での絞り込みは全件走査と**等価**になる。
 *
 * JSON モードは 30秒キャッシュ済みのファイルを絞るだけなので追加コストはない。
 */
export async function getOrdersByHappCustomerIds(happIds: number[]): Promise<HappOrder[]> {
  if (happIds.length === 0) return []

  if (getDataSource() === 'supabase') {
    // cache() のキーは引数の同一性で決まるため、順序を正規化した文字列に畳む
    return loadOrdersByCustomerIds([...happIds].sort((a, b) => a - b).join(','))
  }
  const ids = new Set(happIds)
  return (await getCachedOrders()).filter((o) => ids.has(o.customerId))
}

export async function getOrdersFile(): Promise<HappOrdersFile | null> {
  if (getDataSource() === 'supabase') {
    const [orders, lastSyncedAt] = await Promise.all([
      loadOrdersFromSupabase(),
      loadLastSyncedAt(),
    ])
    return { lastSyncedAt: lastSyncedAt ?? new Date().toISOString(), orders }
  }
  return getCachedHappOrdersFile()
}

async function loadLastSyncedAt(): Promise<string | null> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('sync_logs')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.synced_at ?? null
}

/** happ_orders の1行。select する列と1対1で対応させること。 */
type OrderRow = {
  order_id:        number
  customer_id:     number
  customer_name:   string | null
  start_time:      string | null
  end_time:        string | null
  course:          string | null
  area:            string | null
  payment_method:  string | null
  status:          string | null
  internal_status: string | null
  total_amount:    number | null
  therapist_fee:   number | null
  source:          string | null
  synced_at:       string | null
}

/** Supabase の行を HappOrder へ変換する。全件取得と絞り込み取得で共用する。 */
function toHappOrder(row: OrderRow): HappOrder {
  return {
    orderId:        row.order_id,
    customerId:     row.customer_id,
    customerName:   row.customer_name ?? '',
    startTime:      row.start_time ?? '',
    endTime:        row.end_time ?? '',
    course:         row.course ?? '',
    area:           row.area ?? '',
    paymentMethod:  row.payment_method ?? '',
    status:         row.status ?? '',
    internalStatus: row.internal_status ?? '',
    totalAmount:    row.total_amount ?? 0,
    therapistFee:   row.therapist_fee ?? 0,
    source:         (row.source ?? 'orderList') as HappOrder['source'],
    syncedAt:       row.synced_at ?? '',
  }
}

const ORDER_COLUMNS =
  'order_id,customer_id,customer_name,start_time,end_time,course,area,payment_method,status,internal_status,total_amount,therapist_fee,source,synced_at'

/**
 * customer_id で絞ってオーダーを取得する（Supabase）。
 * 顧客1名ぶんは1000行を超えないため単一クエリで足りる。
 * scope は全件取得と同じ getScopedTherapistId() を使い、RLS の見え方を揃える。
 */
const loadOrdersByCustomerIds = cache(async (happIdsKey: string): Promise<HappOrder[]> => {
  const supabase = await createSupabaseSessionClient()
  if (!supabase) return []
  const { getScopedTherapistId } = await import('../admin-view')
  const scopeId = await getScopedTherapistId()
  if (!scopeId) return []

  const { data, error } = await supabase
    .from('happ_orders')
    .select(ORDER_COLUMNS)
    .eq('therapist_id', scopeId)
    .in('customer_id', happIdsKey.split(',').map(Number))
    .order('start_time', { ascending: false })
    .order('order_id',   { ascending: false })
  if (error) throw new Error(`happ_orders(by customer): ${error.message}`)

  return ((data ?? []) as unknown as OrderRow[]).map(toHappOrder)
})

/**
 * Supabase からオーダー全件を取得する。
 * - サーバー側上限（1000行）を超えるため件数を先に取得し、全ページを並列取得する
 * - React cache() により同一リクエスト内の再呼び出しは1回にまとまる
 */
const loadOrdersFromSupabase = cache(async (): Promise<HappOrder[]> => {
  // セッションクライアント（RLS 適用）+ スコープ（本人 or 閲覧モードの対象者）
  const supabase = await createSupabaseSessionClient()
  if (!supabase) return []
  const { getScopedTherapistId } = await import('../admin-view')
  const scopeId = await getScopedTherapistId()
  if (!scopeId) return []

  const PAGE = 1000

  const { count, error: countErr } = await supabase
    .from('happ_orders')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', scopeId)
  if (countErr) throw new Error(`happ_orders count: ${countErr.message}`)
  const total = count ?? 0
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE)
  const results = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      supabase
        .from('happ_orders')
        .select(ORDER_COLUMNS)
        .eq('therapist_id', scopeId)
        // start_time は一意でないため、これ単独で並列ページングすると
        // ページ境界にまたがる同時刻データの順序が保証されず、
        // 同じ行が2回取れる（売上二重計上）か1行落ちる（売上欠損）。
        // 一意な order_id を第2キーに置いて順序を確定させる。
        .order('start_time', { ascending: false })
        .order('order_id',   { ascending: false })
        .range(i * PAGE, (i + 1) * PAGE - 1),
    ),
  )

  const rows: OrderRow[] = []
  for (const { data, error } of results) {
    if (error) throw new Error(`happ_orders: ${error.message}`)
    rows.push(...((data ?? []) as unknown as OrderRow[]))
  }

  return rows.map(toHappOrder)
})
