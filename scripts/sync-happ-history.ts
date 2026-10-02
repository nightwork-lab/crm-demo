/**
 * uriageTherapist から過去データを月単位で取得する CLI。
 *
 * 実行例:
 *   npm run sync:happ-history                          # デフォルト: 2025-01 〜 2025-12
 *   npm run sync:happ-history -- --from 2025-01 --to 2025-12
 *   npm run sync:happ-history -- --from 2024-06 --to 2024-12
 */

import { chromium } from 'playwright'
import { config } from 'dotenv'
import { resolve } from 'path'
import { fetchHistoricalMonth, type HistorySyncResult } from '../app/lib/happ-history'

config({ path: resolve(process.cwd(), '.env.local') })

// ---------- CLI 引数パース ----------

function parseArgs(): { from: string; to: string } {
  const args = process.argv.slice(2)
  let from = '2025-01'
  let to   = '2025-12'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) from = args[i + 1]
    if (args[i] === '--to'   && args[i + 1]) to   = args[i + 1]
  }
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    console.error('形式エラー: --from と --to は YYYY-MM 形式で指定してください')
    process.exit(1)
  }
  return { from, to }
}

function monthRange(from: string, to: string): Array<{ year: number; month: number }> {
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  const result: Array<{ year: number; month: number }> = []
  while (y < ey || (y === ey && m <= em)) {
    result.push({ year: y, month: m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

// ---------- メイン ----------

async function main(): Promise<void> {
  const tel  = process.env.HAPP_TEL
  const pass = process.env.HAPP_PASS
  if (!tel || !pass) {
    console.error('エラー: .env.local に HAPP_TEL と HAPP_PASS を設定してください')
    process.exit(1)
  }

  const { from, to } = parseArgs()
  const months       = monthRange(from, to)

  console.log(`対象期間: ${from} 〜 ${to}（${months.length}ヶ月）`)
  console.log('━'.repeat(50))

  const browser = await chromium.launch({ headless: true })
  const page    = await browser.newPage()

  try {
    // ログイン
    console.log('ログイン中...')
    await page.goto('https://happ-s.com/control/worker/hs/login/', { waitUntil: 'domcontentloaded' })
    await page.fill('#tel', tel)
    await page.fill('#pass', pass)
    await page.click('button[type="submit"]')
    await page.waitForLoadState('domcontentloaded')
    if (page.url().includes('/login/')) {
      throw new Error('ログインに失敗しました')
    }
    console.log('ログイン成功\n')

    // 月ごとに取得
    const results: HistorySyncResult[] = []
    const allErrors: string[] = []

    for (const { year, month } of months) {
      const label = `${year}-${pad2(month)}`
      console.log(`\n──── ${label} ────`)

      try {
        const result = await fetchHistoricalMonth(
          page, year, month,
          (msg) => console.log('  ' + msg),
        )
        results.push(result)

        console.log(`  → 取得:${result.fetched}件 / 追加:${result.added}件 / 重複:${result.duplicates}件`)

        if (result.errors.length > 0) {
          result.errors.forEach(e => allErrors.push(`[${label}] ${e}`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  ⚠ ${label} 月全体エラー: ${msg}`)
        allErrors.push(`[${label}] 月全体エラー: ${msg}`)
      }
    }

    // ---- 全体サマリー ----
    const totalFetched    = results.reduce((s, r) => s + r.fetched,    0)
    const totalAdded      = results.reduce((s, r) => s + r.added,      0)
    const totalDuplicates = results.reduce((s, r) => s + r.duplicates, 0)
    const totalSaved      = results.at(-1)?.totalSaved ?? 0

    const allNames   = [...new Set(results.flatMap(r => r.customerNames))].sort()
    const allOrderIds = [...new Set(results.flatMap(r => r.orderIds))].sort((a, b) => a - b)

    console.log('\n' + '═'.repeat(50))
    console.log('  全体サマリー')
    console.log('═'.repeat(50))
    console.log(`  期間         : ${from} 〜 ${to}`)
    console.log(`  処理月数     : ${results.length}ヶ月`)
    console.log()
    console.log('  月別集計:')
    for (const r of results) {
      const label = `${r.year}-${pad2(r.month)}`
      const errMark = r.errors.length > 0 ? ` ⚠${r.errors.length}エラー` : ''
      console.log(`    ${label}: 稼働${r.activeDays}日 取得${r.fetched}件 追加${r.added}件 重複${r.duplicates}件${errMark}`)
    }
    console.log()
    console.log(`  合計取得     : ${totalFetched}件`)
    console.log(`  合計追加     : ${totalAdded}件`)
    console.log(`  重複スキップ : ${totalDuplicates}件`)
    console.log(`  保存済み総計 : ${totalSaved}件`)
    console.log()
    console.log(`  ユニーク orderId: ${allOrderIds.length}件`)
    console.log(`    範囲: ${allOrderIds[0]} 〜 ${allOrderIds.at(-1)}`)
    console.log()
    console.log(`  ユニーク顧客名: ${allNames.length}名`)
    console.log(`    ${allNames.join(', ')}`)

    if (allErrors.length > 0) {
      console.log(`\n  ⚠ エラー一覧（${allErrors.length}件）:`)
      allErrors.forEach(e => console.log(`    ${e}`))
    }

  } catch (err) {
    console.error('\n致命的エラー:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
