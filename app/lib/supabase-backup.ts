/**
 * Supabase 全テーブルのスナップショットを data/backups/ に保存する。
 * - ファイル名: supabase-YYYYMMDD_HHMMSS.json
 * - ローテーション: 最新 14 世代のみ保持
 * - data/backups/ は .gitignore 対象（顧客情報を含むため git に乗らない）
 * server side 専用。
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createSupabaseServerClient } from './supabase-server'

const BACKUP_DIR = resolve(process.cwd(), 'data/backups')
const TABLES = [
  'customers', 'happ_orders', 'customer_links',
  'predictions', 'monthly_targets', 'therapists',
] as const
const KEEP = 14

export type BackupResult =
  | { ok: true;  path: string; counts: Record<string, number>; skipped?: false }
  | { ok: true;  skipped: true; reason: string }
  | { ok: false; error: string }

function timestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function todayPrefix(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `supabase-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}

/** 当日分のバックアップが既に存在するか。 */
export function hasTodayBackup(): boolean {
  if (!existsSync(BACKUP_DIR)) return false
  const prefix = todayPrefix()
  return readdirSync(BACKUP_DIR).some((f) => f.startsWith(prefix))
}

function rotate(): void {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('supabase-') && f.endsWith('.json'))
    .sort()
  while (files.length > KEEP) {
    const oldest = files.shift()!
    try { unlinkSync(resolve(BACKUP_DIR, oldest)) } catch {}
  }
}

/**
 * スナップショットを保存する。
 * onlyOncePerDay=true の場合、当日分が既にあればスキップ（同期時の自動実行用）。
 */
export async function backupSupabase(onlyOncePerDay = false): Promise<BackupResult> {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { ok: false, error: 'Supabase 未設定' }
    }
    if (onlyOncePerDay && hasTodayBackup()) {
      return { ok: true, skipped: true, reason: '当日分は取得済み' }
    }

    const supabase = createSupabaseServerClient()
    const backup: Record<string, unknown> = { backedUpAt: new Date().toISOString() }
    const counts: Record<string, number> = {}

    for (const table of TABLES) {
      const rows: unknown[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
        if (error) throw new Error(`${table}: ${error.message}`)
        rows.push(...(data ?? []))
        if (!data || data.length < 1000) break
      }
      backup[table] = rows
      counts[table] = rows.length
    }

    mkdirSync(BACKUP_DIR, { recursive: true })
    const path = resolve(BACKUP_DIR, `supabase-${timestamp()}.json`)
    writeFileSync(path, JSON.stringify(backup), 'utf-8')
    rotate()

    return { ok: true, path, counts }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
