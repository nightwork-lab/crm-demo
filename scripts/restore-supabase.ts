/**
 * Supabase をバックアップファイルから復元する（upsert 方式）。
 *
 * 安全設計:
 *   - デフォルトは dry-run（何も書き込まない）
 *   - 実行には --confirm フラグが必須
 *   - upsert 復元のため「バックアップ後に追加された行」は消えない
 *     （完全な巻き戻しが必要な場合は Supabase ダッシュボードで手動対応）
 *
 * 使い方:
 *   npm run restore:supabase -- data/backups/supabase-YYYYMMDD_HHMMSS.json            # dry-run
 *   npm run restore:supabase -- data/backups/supabase-YYYYMMDD_HHMMSS.json --confirm  # 実行
 */
import { loadEnvConfig } from '@next/env'
import { readFileSync } from 'fs'
import { resolve } from 'path'
loadEnvConfig(process.cwd())

const CONFLICT_KEYS: Record<string, string> = {
  customers:       'id',
  happ_orders:     'order_id',
  customer_links:  'therapist_id,happ_customer_id',
  predictions:     'therapist_id,customer_id,target_month',
  monthly_targets: 'therapist_id,target_month',
  therapists:      'id',
}

async function main() {
  const args    = process.argv.slice(2)
  const file    = args.find((a) => !a.startsWith('--'))
  const confirm = args.includes('--confirm')

  if (!file) {
    console.error('使い方: npm run restore:supabase -- <バックアップファイル> [--confirm]')
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf-8'))
  console.log('バックアップ日時:', raw.backedUpAt)
  console.log('モード:', confirm ? '【実行】' : '【dry-run（書き込みなし）】')
  console.log('')

  for (const [table, key] of Object.entries(CONFLICT_KEYS)) {
    const rows = raw[table]
    if (!Array.isArray(rows)) {
      console.log(`  skip  ${table}（バックアップに含まれない）`)
      continue
    }
    console.log(`  ${table}: ${rows.length}件${confirm ? ' を復元中...' : ''}`)

    if (confirm) {
      const { createSupabaseServerClient } = await import('../app/lib/supabase-server')
      const supabase = createSupabaseServerClient()
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase
          .from(table)
          .upsert(rows.slice(i, i + 500), { onConflict: key })
        if (error) {
          console.error(`  ❌ ${table}: ${error.message}`)
          process.exit(1)
        }
      }
    }
  }

  console.log('')
  console.log(confirm
    ? '✅ 復元完了（upsert 方式のため、バックアップ後に追加された行は残っています）'
    : 'dry-run 完了。実行するには --confirm を付けてください')
}

main()
