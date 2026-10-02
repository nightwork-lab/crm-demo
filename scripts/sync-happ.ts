/**
 * happ-s.com 最新同期 CLI（orderList + orderListCash）。
 * 過去データ取得は sync:happ-history を使うこと。
 *
 * 実行: npm run sync:happ
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { runHappSync } from '../app/lib/happ-sync'

config({ path: resolve(process.cwd(), '.env.local') })

function pad(n: number, width = 6): string {
  return String(n).padStart(width, ' ')
}

async function main(): Promise<void> {
  console.log('happ-s.com 最新同期を開始します...')
  const start = Date.now()

  const result = await runHappSync()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  if (!result.success) {
    console.error(`\n[失敗] ${result.error}`)
    process.exit(1)
  }

  const { syncedAt, fetchedList, fetchedCash, newCount, updatedCount,
          totalCount, sourceCount, count2026, upcomingCount } = result

  const syncedAtJST = new Date(syncedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  console.log(`\n${'═'.repeat(46)}`)
  console.log('  同期完了')
  console.log('═'.repeat(46))
  console.log(`  同期日時    : ${syncedAtJST}`)
  console.log(`  所要時間    : ${elapsed} 秒`)
  console.log()
  console.log('  ── 取得 ──────────────────────────')
  console.log(`  orderList   :${pad(fetchedList)} 件`)
  console.log(`  orderListCash:${pad(fetchedCash)} 件`)
  console.log()
  console.log('  ── 結果 ──────────────────────────')
  console.log(`  新規追加    :${pad(newCount)} 件`)
  console.log(`  更新（上書き）:${pad(updatedCount)} 件`)
  console.log(`  保存済み総計 :${pad(totalCount)} 件`)
  console.log()
  console.log('  ── 保存済み source 別 ────────────')
  const srcOrder: Array<HappOrder['source']> = ['orderList', 'orderListCash', 'uriageTherapist']
  // dynamic import を避けるため型を明示
  for (const src of srcOrder as string[]) {
    const c = sourceCount[src] ?? 0
    if (c > 0) console.log(`  ${src.padEnd(18)}:${pad(c)} 件`)
  }
  console.log()
  console.log('  ── 2026年サマリー ────────────────')
  console.log(`  2026年オーダー :${pad(count2026)} 件`)
  console.log(`  今日以降の予約 :${pad(upcomingCount)} 件`)
  console.log('═'.repeat(46))
}

// HappOrder の source 型のみ流用（import文を減らすためインライン）
type HappOrder = { source: string }

main()
