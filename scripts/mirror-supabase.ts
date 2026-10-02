/**
 * ローカル JSON の内容を Supabase（本番の参照先）へ反映する CLI。
 *
 * これまで happ 同期ボタン（syncHappAction）の中でしかミラーを実行できず、
 * 「同期はしたがミラーだけ失敗した」状態を単独で復旧できなかったため用意した。
 * happ へはアクセスしない。ローカル JSON → Supabase の一方向反映のみ。
 *
 * 実行例:
 *   npm run mirror:supabase
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

async function main(): Promise<void> {
  // dotenv 読み込み後に import する（モジュール評価時に環境変数を参照するため）
  const { mirrorToSupabase } = await import('../app/lib/supabase-mirror')

  console.log('Supabase への反映を開始します...')
  const result = await mirrorToSupabase()

  if (result.ok) {
    console.log(`✓ 反映完了: ${result.detail}`)
    process.exit(0)
  }
  console.error(`✗ 反映失敗: ${result.detail}`)
  process.exit(1)
}

main().catch((e) => {
  console.error('✗ 予期しないエラー:', e instanceof Error ? e.message : e)
  process.exit(1)
})
