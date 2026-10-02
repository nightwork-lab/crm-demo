/**
 * オーナーアカウント経由の「過去データ一括取り込み」ワーカー（初回移行用）。
 *
 * 日次同期（owner-sync-worker）は直近しか取得しないため、
 * 開業月から現在までを月単位で巡回して全期間を取り込む。
 *
 * 実行: npm run sync:owner-history
 *   Railway では専用サービスとして手動実行する想定（運営が操作）。
 *
 * 環境変数:
 *   HAPP_OWNER_ID / HAPP_OWNER_PASS      … オーナーアカウント
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   HISTORY_FROM  … 開始年月 "YYYY-MM"（既定 2022-04）
 *   HISTORY_TO    … 終了年月 "YYYY-MM"（既定 今月）
 *
 * 特徴:
 *   - 完了した「セラピスト×月」は sync_logs に記録し、再実行時はスキップ（中断・再開可）
 *   - happ への負荷配慮で各ページ取得に待機を入れる
 *   - 顧客名・金額はログに出さない（件数のみ）
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

type MonthKey = { year: number; month: number }

function parseYm(s: string | undefined, fallback: MonthKey): MonthKey {
  const m = s?.match(/^(\d{4})-(\d{2})$/)
  if (!m) return fallback
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) }
}

function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  let y = from.year, mo = from.month
  while (y < to.year || (y === to.year && mo <= to.month)) {
    out.push({ year: y, month: mo })
    mo++
    if (mo > 12) { mo = 1; y++ }
  }
  return out
}

const label = (m: MonthKey) => `${m.year}-${String(m.month).padStart(2, '0')}`

async function main() {
  const {
    loginOwner, fetchTherapists, fetchOrdersForMonth, upsertTherapistOrders, safeDiagnose,
  } = await import('../app/lib/happ-owner-sync')
  const { createSupabaseServerClient } = await import('../app/lib/supabase-server')

  const supabase = createSupabaseServerClient()
  const now = new Date()

  const from = parseYm(process.env.HISTORY_FROM, { year: 2022, month: 4 })
  const to   = parseYm(process.env.HISTORY_TO,   { year: now.getFullYear(), month: now.getMonth() + 1 })
  const months = monthRange(from, to)

  // 対象セラピスト（happ_worker_id 設定済み・有効）
  // HISTORY_WORKER_IDS="505,250" のように happ 番号で絞り込める（復元作業用）
  const onlyWorkerIds = new Set(
    (process.env.HISTORY_WORKER_IDS ?? '')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n)),
  )
  const { data: therapists, error } = await supabase
    .from('therapists')
    .select('id, display_name, happ_worker_id')
    .eq('active', true)
    .not('happ_worker_id', 'is', null)
  if (error) throw new Error(`therapists: ${error.message}`)
  const targets = (therapists ?? []).filter(
    t => onlyWorkerIds.size === 0 || onlyWorkerIds.has(t.happ_worker_id as number),
  )
  if (targets.length === 0) {
    if (onlyWorkerIds.size > 0) {
      console.log(`HISTORY_WORKER_IDS に一致する有効なセラピストがいません（指定: ${[...onlyWorkerIds].join(',')}）`)
    } else {
      console.log('同期対象がいません（therapists.happ_worker_id を設定してください）')
    }
    return
  }
  if (onlyWorkerIds.size > 0) {
    const found = new Set(targets.map(t => t.happ_worker_id as number))
    const missing = [...onlyWorkerIds].filter(id => !found.has(id))
    if (missing.length > 0) console.log(`⚠ HISTORY_WORKER_IDS のうち一致しなかった番号: ${missing.join(',')}`)
  }

  // 完了済みの「セラピスト×月」を取得（再実行時のスキップ用）。
  // 以前は .limit(10000) の1回取得だったが、サーバー側の上限（1,000行）で切れて
  // スキップ集合が欠け、完了済みの月が不規則に再実行されていた。
  // 対象月に絞ったうえで、空ページが返るまで分割して全件読む（上限値に依存しない）。
  // HISTORY_FORCE=1 でスキップ集合を無視して取り直す（復元作業用）。
  // 全期間×全員の強制再取得は事故が大きすぎるので、HISTORY_FROM/HISTORY_TO か
  // HISTORY_WORKER_IDS で範囲が明示されているときだけ有効にする。
  const force = process.env.HISTORY_FORCE === '1'
  if (force && !process.env.HISTORY_FROM && !process.env.HISTORY_TO && onlyWorkerIds.size === 0) {
    throw new Error('HISTORY_FORCE=1 は HISTORY_FROM/HISTORY_TO または HISTORY_WORKER_IDS と併用してください（全期間×全員の強制再取得は拒否）')
  }
  const done = new Set<string>()
  if (!force) {
    const sources = months.map(m => `history:${label(m)}`)
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data: doneLogs, error: logErr } = await supabase
        .from('sync_logs')
        .select('therapist_id, source')
        .in('source', sources)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (logErr) throw new Error(`sync_logs: ${logErr.message}`)
      if (!doneLogs || doneLogs.length === 0) break
      for (const l of doneLogs) {
        done.add(`${l.therapist_id}|${String(l.source).replace('history:', '')}`)
      }
    }
  }

  console.log(`対象セラピスト: ${targets.length}名${onlyWorkerIds.size > 0 ? `（HISTORY_WORKER_IDS で絞り込み）` : ''}`)
  console.log(`対象期間: ${label(from)} 〜 ${label(to)}（${months.length}ヶ月）`)
  console.log(force ? '強制再取得: HISTORY_FORCE=1（完了記録を無視）' : `スキップ対象（取得済み）: ${done.size}件`)
  console.log('')

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security', '--no-sandbox'],
  })

  let totalFetched = 0, totalMonths = 0, errors = 0

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page    = await context.newPage()

    await loginOwner(page)
    console.log('✓ オーナーログイン成功\n')

    const happIds = new Set((await fetchTherapists(page)).map(t => t.workerId))

    for (const t of targets) {
      const workerId = t.happ_worker_id as number
      const tid = String(t.id)
      if (!happIds.has(workerId)) {
        console.log(`⚠ ${t.display_name}: happ_worker_id=${workerId} が happ 上に見つかりません。スキップ`)
        errors++
        continue
      }

      console.log(`── ${t.display_name} ──`)
      for (const m of months) {
        const key = `${tid}|${label(m)}`
        if (done.has(key)) continue

        const syncedAt = new Date().toISOString()
        try {
          const parsed = await fetchOrdersForMonth(page, workerId, m.year, m.month, syncedAt)
          const result = await upsertTherapistOrders(tid, workerId, parsed)
          totalFetched += result.fetched
          totalMonths++
          console.log(
            `  ${label(m)}: 取得 ${result.fetched}件` +
            (result.removed > 0 ? ` / 削除 ${result.removed}件` : '') +
            (result.reconcileSkipped ? ` / ⚠ ${result.reconcileSkipped}` : ''),
          )

          // 完了マーク（再実行時のスキップ用）
          await supabase.from('sync_logs').insert({
            synced_at:    syncedAt,
            orders_total: result.fetched,
            source:       `history:${label(m)}`,
            therapist_id: tid,
          })
        } catch (err) {
          errors++
          const msg  = err instanceof Error ? err.message : String(err)
          const diag = await safeDiagnose(page)
          console.error(`  ✗ ${label(m)}: ${msg}`)
          await supabase.from('sync_logs').insert({
            synced_at:     syncedAt,
            source:        'history-error',
            therapist_id:  tid,
            error_message: `${label(m)}: ${msg} | diag=${diag}`.slice(0, 500),
          })
        }
      }
      console.log('')
    }
  } finally {
    await browser.close()
  }

  console.log('='.repeat(40))
  console.log(`完了: ${totalMonths}ヶ月分 / 合計 ${totalFetched}件 取得`)
  if (errors > 0) {
    console.log(`⚠ エラー ${errors}件（再実行すると未取得分から続行します）`)
    process.exit(1)
  }
  if (force) {
    console.log('✅ 強制再取得が完了しました。Railway の変数から HISTORY_FORCE（と HISTORY_WORKER_IDS）を外してください。残したままだと次の Deploy でも再取得が走ります')
  } else {
    console.log('✅ 全期間の取り込みが完了しました')
  }
}

main().catch((err) => {
  console.error('致命的エラー:', err instanceof Error ? err.message : err)
  process.exit(1)
})
