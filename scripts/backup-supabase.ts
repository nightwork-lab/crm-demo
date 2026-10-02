/**
 * Supabase 全テーブルのスナップショットを手動取得する。
 * 実行: npm run backup:supabase
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

async function main() {
  const { backupSupabase } = await import('../app/lib/supabase-backup')
  const r = await backupSupabase(false)
  if (!r.ok) {
    console.error('❌ バックアップ失敗:', r.error)
    process.exit(1)
  }
  if ('skipped' in r && r.skipped) {
    console.log('スキップ:', r.reason)
    return
  }
  console.log('✅ バックアップ完了:', r.path)
  for (const [table, count] of Object.entries(r.counts)) {
    console.log(`  ${table}: ${count}件`)
  }
}

main()
