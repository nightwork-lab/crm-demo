/**
 * 月間目標の読み書き。DATA_SOURCE に応じて JSON または Supabase。
 * Supabase モードではセッションクライアント（RLS 適用）でセラピスト別に分離される。
 * server side 専用。
 */
import { cache } from 'react'
import { getDataSource } from '../data-source'
import { createSupabaseSessionClient } from '../supabase-server'
import { getCurrentTherapistId } from '../auth-context'
import {
  getMonthlyTarget as getJson,
  upsertMonthlyTarget as upsertJson,
  type MonthlyTarget,
} from '../monthly-target'

export type { MonthlyTarget }

// React cache(): 同一リクエスト内の重複取得を排除（引数の月がキーになる）
export const getTarget = cache(async (targetMonth: string): Promise<MonthlyTarget | null> => {
  if (getDataSource() !== 'supabase') return getJson(targetMonth)

  const supabase = await createSupabaseSessionClient()
  if (!supabase) return null
  const { getScopedTherapistId } = await import('../admin-view')
  const scopeId = await getScopedTherapistId()
  if (!scopeId) return null
  const { data, error } = await supabase
    .from('monthly_targets')
    .select('target_month,target_revenue,updated_at')
    .eq('therapist_id', scopeId)
    .eq('target_month', targetMonth)
    .maybeSingle()
  if (error) throw new Error(`monthly_targets: ${error.message}`)
  if (!data) return null
  return {
    targetMonth:   data.target_month,
    targetRevenue: data.target_revenue ?? 0,
    updatedAt:     data.updated_at ?? '',
  }
})

export async function saveTarget(
  target: Omit<MonthlyTarget, 'updatedAt'>,
): Promise<void> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (getDataSource() !== 'supabase') {
    upsertJson(target)
    return
  }

  const supabase    = await createSupabaseSessionClient()
  const therapistId = await getCurrentTherapistId()
  if (!supabase || !therapistId) throw new Error('ログインが必要です')

  const { error } = await supabase.from('monthly_targets').upsert({
    therapist_id:   therapistId,
    target_month:   target.targetMonth,
    target_revenue: target.targetRevenue,
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'therapist_id,target_month' })
  if (error) throw new Error(`monthly_targets upsert: ${error.message}`)
}
