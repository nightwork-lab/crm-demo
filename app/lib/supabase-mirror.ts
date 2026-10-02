/**
 * ローカル JSON（正典）を Supabase へミラーリングする。
 * 同期成功後に呼ばれ、管理者（オーナー）のデータとして upsert + 不要行削除を行う。
 *
 * - therapist_id は therapists テーブルの管理者（role='admin'）を自動取得
 * - 削除は「管理者所有 かつ ローカルに存在しない行」のみ（他セラピストのデータには触れない）
 * - service_role キーを使用（RLS バイパス）。server side 専用。
 */
import { createSupabaseServerClient } from './supabase-server'
import { backupSupabase } from './supabase-backup'
import { loadCustomers } from './data'
import { loadCustomerLinks } from './customer-link'
import { loadPredictions } from './prediction'
import { loadMonthlyTargets } from './monthly-target'
import { readFileSync } from 'fs'
import { dataPath } from './data-dir'
import type { HappOrder } from './happ-order'

export type MirrorResult = {
  ok:      boolean
  detail:  string
}

const CHUNK = 500

function loadOrders(): HappOrder[] {
  try {
    const raw = JSON.parse(readFileSync(dataPath('happ-orders.json'), 'utf-8'))
    return raw.orders ?? []
  } catch {
    return []
  }
}

async function getAdminTherapistId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
): Promise<string> {
  const { data, error } = await supabase
    .from('therapists')
    .select('id')
    .eq('role', 'admin')
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error || !data) throw new Error('管理者セラピストが見つかりません')
  return String(data.id)
}

async function upsertChunked(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  rows: object[],
  conflictKey: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: conflictKey })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

/** ISO文字列を比較可能なミリ秒に。空/未定義は最古（0）扱い。 */
function ts(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/**
 * 「新しい方が勝つ」フィルタ。
 * ローカル行のうち、本番に存在しない or ローカルの更新日時が本番以上のものだけ返す。
 * これにより本番（Supabase）側で後から編集された行をローカルの古い値で上書きしない。
 */
function newerThanRemote<T>(
  localRows: T[],
  localKey: (row: T) => string,
  localTime: (row: T) => string | null | undefined,
  remote: Map<string, string | null>,
): T[] {
  return localRows.filter((row) => {
    const r = remote.get(localKey(row))
    if (r === undefined) return true            // 本番に無い → 新規として反映
    return ts(localTime(row)) >= ts(r)          // ローカルが本番以上 → 反映
  })
}

/** 管理者所有の行のうちローカルに存在しないものを削除する。 */
async function deleteStale(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  idColumn: string,
  localIds: Set<string | number>,
  therapistId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select(idColumn)
    .eq('therapist_id', therapistId)
    .limit(10000)
  if (error) throw new Error(`${table} 照会: ${error.message}`)

  const staleIds = ((data ?? []) as unknown as Record<string, string | number>[])
    .map((r) => r[idColumn])
    .filter((id) => !localIds.has(id))

  for (let i = 0; i < staleIds.length; i += CHUNK) {
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq('therapist_id', therapistId)
      .in(idColumn, staleIds.slice(i, i + CHUNK))
    if (delErr) throw new Error(`${table} 削除: ${delErr.message}`)
  }
  return staleIds.length
}

/** JSON 正典を Supabase へ反映する。エラー時も例外を投げず結果で返す。 */
export async function mirrorToSupabase(): Promise<MirrorResult> {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { ok: false, detail: 'Supabase 未設定のためスキップ' }
    }

    // 書き込み前に当日1回だけスナップショットを取得（ロールバック用）
    await backupSupabase(true)

    const supabase    = createSupabaseServerClient()
    const therapistId = await getAdminTherapistId(supabase)

    const customers = loadCustomers()
    const orders    = loadOrders()
    const links     = loadCustomerLinks()
    const preds     = loadPredictions()
    const targets   = loadMonthlyTargets()

    // ── customers: 新しい方が勝つ（本番での顧客編集を守る）──
    const { data: remoteCustomers } = await supabase
      .from('customers').select('id,updated_at').eq('therapist_id', therapistId)
    const remoteCustomerMap = new Map(
      (remoteCustomers ?? []).map((r) => [String(r.id), r.updated_at as string | null]),
    )
    const customersToUpsert = newerThanRemote(customers, (c) => c.id, (c) => c.updatedAt, remoteCustomerMap)
    await upsertChunked(supabase, 'customers', customersToUpsert.map((c) => ({
      id:                   c.id,
      name:                 c.name,
      memo:                 c.memo ?? '',
      tags:                 c.tags ?? [],
      last_visit:           c.lastVisit || null,
      total_sales:          c.totalSales ?? 0,
      repeat_count:         c.repeatCount ?? 0,
      alert_excluded:       c.alertExcluded ?? false,
      alert_exclude_reason: c.alertExcludeReason ?? null,
      birthday:             c.birthday ?? null,
      anniversary_excluded: c.anniversaryExcluded ?? false,
      next_reservation:     c.nextReservation ?? null,
      prediction_exclude:   c.predictionExclude ?? null,
      updated_at:           c.updatedAt ?? new Date(0).toISOString(),
      therapist_id:         therapistId,
    })), 'id')

    await upsertChunked(supabase, 'happ_orders', orders.map((o) => ({
      order_id:        o.orderId,
      customer_id:     o.customerId,
      customer_name:   o.customerName,
      start_time:      o.startTime,
      end_time:        o.endTime ?? '',
      course:          o.course ?? '',
      area:            o.area ?? '',
      payment_method:  o.paymentMethod ?? '',
      status:          o.status ?? '',
      internal_status: o.internalStatus ?? '',
      total_amount:    o.totalAmount ?? 0,
      therapist_fee:   o.therapistFee ?? 0,
      source:          o.source,
      synced_at:       o.syncedAt,
      therapist_id:    therapistId,
    })), 'order_id')

    // ── customer_links: linked_at で新しい方が勝つ ──
    const { data: remoteLinks } = await supabase
      .from('customer_links').select('happ_customer_id,linked_at').eq('therapist_id', therapistId)
    const remoteLinkMap = new Map(
      (remoteLinks ?? []).map((r) => [String(r.happ_customer_id), r.linked_at as string | null]),
    )
    const linksToUpsert = newerThanRemote(links, (l) => String(l.happCustomerId), (l) => l.linkedAt, remoteLinkMap)
    await upsertChunked(supabase, 'customer_links', linksToUpsert.map((l) => ({
      happ_customer_id: l.happCustomerId,
      crm_customer_id:  l.crmCustomerId,
      linked_at:        l.linkedAt,
      linked_by:        l.linkedBy,
      note:             l.note ?? null,
      therapist_id:     therapistId,
    })), 'therapist_id,happ_customer_id')

    // ── predictions / monthly_targets: 更新日時が新しい方を優先 ──
    // 本番（Supabase）側で編集された行を、ローカルの古い値で上書きしない。
    const { data: remotePreds } = await supabase
      .from('predictions')
      .select('customer_id,target_month,updated_at')
      .eq('therapist_id', therapistId)
    const remotePredMap = new Map(
      (remotePreds ?? []).map((r) => [`${r.customer_id}|${r.target_month}`, r.updated_at as string]),
    )
    const predsToUpsert = preds.filter((p) => {
      const remote = remotePredMap.get(`${p.customerId}|${p.targetMonth}`)
      return !remote || p.updatedAt >= remote
    })

    await upsertChunked(supabase, 'predictions', predsToUpsert.map((p) => ({
      therapist_id:      therapistId,
      customer_id:       p.customerId,
      target_month:      p.targetMonth,
      predicted_visits:  p.predictedVisits,
      predicted_revenue: p.predictedRevenue,
      memo:              p.memo,
      follow_up_status:  p.followUpStatus ?? null,
      updated_at:        p.updatedAt,
    })), 'therapist_id,customer_id,target_month')

    const { data: remoteTargets } = await supabase
      .from('monthly_targets')
      .select('target_month,updated_at')
      .eq('therapist_id', therapistId)
    const remoteTargetMap = new Map(
      (remoteTargets ?? []).map((r) => [r.target_month as string, r.updated_at as string]),
    )
    const targetsToUpsert = targets.filter((t) => {
      const remote = remoteTargetMap.get(t.targetMonth)
      return !remote || t.updatedAt >= remote
    })

    await upsertChunked(supabase, 'monthly_targets', targetsToUpsert.map((t) => ({
      therapist_id:   therapistId,
      target_month:   t.targetMonth,
      target_revenue: t.targetRevenue,
      updated_at:     t.updatedAt,
    })), 'therapist_id,target_month')

    // ── ローカルで消えた行の削除は happ_orders のみ ──
    // オーダーは happ が正典で、幽霊オーダー除去のため削除同期が必要。
    // customers / customer_links は本番（Supabase）側で新規作成され得るため削除しない
    // （削除するとローカル JSON に無い＝本番で作られた顧客が消えるデータ消失事故になる）。
    const removedOrders = await deleteStale(
      supabase, 'happ_orders', 'order_id',
      new Set(orders.map((o) => o.orderId)), therapistId,
    )

    // 最終同期日時の表示用に sync_logs へ記録
    await supabase.from('sync_logs').insert({
      synced_at:    new Date().toISOString(),
      orders_total: orders.length,
      source:       'mirror',
      therapist_id: therapistId,
    })

    const removedNote = removedOrders > 0
      ? `（不要オーダー削除: ${removedOrders}件）`
      : ''
    return {
      ok: true,
      detail: `customers ${customers.length} / orders ${orders.length} / links ${links.length} / predictions ${preds.length} / targets ${targets.length} を反映${removedNote}`,
    }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}
