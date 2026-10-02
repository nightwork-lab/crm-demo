/**
 * 来店予測の読み書き。DATA_SOURCE に応じて JSON または Supabase。
 * Supabase モードではセッションクライアント（RLS 適用）を使い、
 * ログイン中のセラピストのデータのみ読み書きされる。
 * server side 専用。
 */
import { cache } from 'react'
import { getDataSource } from '../data-source'
import { createSupabaseSessionClient } from '../supabase-server'
import { getCurrentTherapistId } from '../auth-context'
import {
  loadPredictions as loadJson,
  upsertPrediction as upsertJson,
  setFollowUpStatus as setStatusJson,
  type CustomerPrediction,
  type FollowUpStatus,
} from '../prediction'

export type { CustomerPrediction, FollowUpStatus }

// ---------- 行変換 ----------

type PredictionRow = {
  customer_id:       string
  target_month:      string
  predicted_visits:  number
  predicted_revenue: number
  memo:              string
  follow_up_status:  FollowUpStatus | null
  updated_at:        string
}

function rowToPrediction(row: PredictionRow): CustomerPrediction {
  return {
    customerId:       row.customer_id,
    targetMonth:      row.target_month,
    predictedVisits:  row.predicted_visits ?? 0,
    predictedRevenue: row.predicted_revenue ?? 0,
    memo:             row.memo ?? '',
    followUpStatus:   row.follow_up_status ?? undefined,
    updatedAt:        row.updated_at ?? '',
  }
}

// ---------- 読み取り ----------

// React cache(): 同一リクエスト内の重複取得を排除
export const getPredictions = cache(async (): Promise<CustomerPrediction[]> => {
  if (getDataSource() !== 'supabase') return loadJson()

  const supabase = await createSupabaseSessionClient()
  if (!supabase) return []
  const { getScopedTherapistId, getAdminViewAs } = await import('../admin-view')
  const scopeId = await getScopedTherapistId()
  if (!scopeId) return []
  // 閲覧モード（運営が他セラピストのデータを見ている間）は予測メモを渡さない
  const hideMemo = (await getAdminViewAs()) !== null
  const { data, error } = await supabase
    .from('predictions')
    .select('customer_id,target_month,predicted_visits,predicted_revenue,memo,follow_up_status,updated_at')
    .eq('therapist_id', scopeId)
  if (error) throw new Error(`predictions: ${error.message}`)
  return (data ?? []).map((row) => {
    const p = rowToPrediction(row)
    return hideMemo ? { ...p, memo: '' } : p
  })
})

export async function getPredictionFor(
  customerId: string,
  targetMonth: string,
): Promise<CustomerPrediction | null> {
  const all = await getPredictions()
  return all.find((p) => p.customerId === customerId && p.targetMonth === targetMonth) ?? null
}

// ---------- 書き込み ----------

export async function savePrediction(
  pred: Omit<CustomerPrediction, 'updatedAt'>,
): Promise<void> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (getDataSource() !== 'supabase') {
    upsertJson(pred)
    return
  }

  const supabase    = await createSupabaseSessionClient()
  const therapistId = await getCurrentTherapistId()
  if (!supabase || !therapistId) throw new Error('ログインが必要です')

  // 既存のフォロー状況を保持（未指定時）
  const existing = await getPredictionFor(pred.customerId, pred.targetMonth)

  const { error } = await supabase.from('predictions').upsert({
    therapist_id:      therapistId,
    customer_id:       pred.customerId,
    target_month:      pred.targetMonth,
    predicted_visits:  pred.predictedVisits,
    predicted_revenue: pred.predictedRevenue,
    memo:              pred.memo,
    follow_up_status:  pred.followUpStatus ?? existing?.followUpStatus ?? null,
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'therapist_id,customer_id,target_month' })
  if (error) throw new Error(`predictions upsert: ${error.message}`)
}

export async function saveFollowUpStatus(
  customerId:  string,
  targetMonth: string,
  status:      FollowUpStatus,
): Promise<FollowUpStatus | null> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (getDataSource() !== 'supabase') {
    const updated = setStatusJson(customerId, targetMonth, status)
    return updated.followUpStatus ?? null
  }

  const supabase    = await createSupabaseSessionClient()
  const therapistId = await getCurrentTherapistId()
  if (!supabase || !therapistId) throw new Error('ログインが必要です')

  const existing = await getPredictionFor(customerId, targetMonth)
  // 同じ状態を再指定したら解除（JSON 版と同じトグル挙動）
  const next: FollowUpStatus | null = existing?.followUpStatus === status ? null : status

  const { error } = await supabase.from('predictions').upsert({
    therapist_id:      therapistId,
    customer_id:       customerId,
    target_month:      targetMonth,
    predicted_visits:  existing?.predictedVisits  ?? 0,
    predicted_revenue: existing?.predictedRevenue ?? 0,
    memo:              existing?.memo ?? '',
    follow_up_status:  next,
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'therapist_id,customer_id,target_month' })
  if (error) throw new Error(`predictions status: ${error.message}`)
  return next
}

/**
 * 複数の予測をまとめて保存する。既存のフォロー状況は保持する。
 * 「全て保存」ボタン用。1件ずつの savePrediction を繰り返すより効率的
 * （既存の読み取りを1回にまとめ、upsert もバッチ化する）。
 */
export async function savePredictionsBatch(
  items: Omit<CustomerPrediction, 'updatedAt'>[],
): Promise<void> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (items.length === 0) return

  const now = new Date().toISOString()

  if (getDataSource() !== 'supabase') {
    // JSON（ローカル）: 1件ずつ upsert（フォロー状況は upsertJson 側で保持）
    for (const p of items) upsertJson(p)
    return
  }

  const supabase    = await createSupabaseSessionClient()
  const therapistId = await getCurrentTherapistId()
  if (!supabase || !therapistId) throw new Error('ログインが必要です')

  // 既存のフォロー状況を1回の取得で集める（未指定時に保持するため）
  const { data: existing } = await supabase
    .from('predictions')
    .select('customer_id,target_month,follow_up_status')
    .eq('therapist_id', therapistId)
  const statusMap = new Map(
    (existing ?? []).map((r) => [`${r.customer_id}|${r.target_month}`, r.follow_up_status as FollowUpStatus | null]),
  )

  const rows = items.map((p) => ({
    therapist_id:      therapistId,
    customer_id:       p.customerId,
    target_month:      p.targetMonth,
    predicted_visits:  p.predictedVisits,
    predicted_revenue: p.predictedRevenue,
    memo:              p.memo,
    follow_up_status:  p.followUpStatus ?? statusMap.get(`${p.customerId}|${p.targetMonth}`) ?? null,
    updated_at:        now,
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('predictions')
      .upsert(rows.slice(i, i + 500), { onConflict: 'therapist_id,customer_id,target_month' })
    if (error) throw new Error(`predictions batch: ${error.message}`)
  }
}
