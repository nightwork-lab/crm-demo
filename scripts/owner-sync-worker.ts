/**
 * オーナーアカウント経由の全セラピスト同期ワーカー（Phase 7 / B案）。
 * Railway 等の常設環境で定期実行する想定。ローカルでの手動実行も可。
 *
 * 実行: npm run sync:owner
 *
 * 必要な環境変数（運営が Railway ダッシュボードで設定する）:
 *   HAPP_OWNER_ID / HAPP_OWNER_PASS  … オーナーアカウント（HAPP_OWNER_TEL でも可）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * 同期対象: therapists.happ_worker_id が設定されている従業員（招待コードの一括発行で紐付く）。
 *
 * 任意の環境変数:
 *   SYNC_LOOKBACK_DAYS        … 何日前まで遡って読むか（既定 14。7日刻みで起点を増やす。0 で今日だけ）
 *   SYNC_LOGIN_RETRIES        … ログイン失敗時の再試行回数（既定 2）
 *   SYNC_LOGIN_RETRY_MINUTES  … 再試行までの待機分（既定 15）
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import type { HappOrder } from '../app/lib/happ-order'
import type { ParsedDayOrders } from '../app/lib/happ-owner-sync'

/** 環境変数の整数（未設定・不正なら既定値） */
function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

async function main() {
  const {
    loginOwner, fetchTherapists, fetchOrdersForTherapist, upsertTherapistOrders, safeDiagnose,
    collectDiagnostics, dayAfter, addDays,
  } = await import('../app/lib/happ-owner-sync')
  const { createSupabaseServerClient } = await import('../app/lib/supabase-server')

  const supabase = createSupabaseServerClient()

  // happ が朝のメンテナンス中でログインできない日がある（2026-08-24 / 09-07 に実績）。
  // 一定時間待って再試行する。SYNC_LOGIN_RETRIES=0 で無効化。
  // 設定ミスで翌日の cron に食い込まないよう上限を置く（最大 5回 × 60分）。
  const loginRetries      = Math.min(envInt('SYNC_LOGIN_RETRIES', 2), 5)
  const loginRetryMinutes = Math.min(envInt('SYNC_LOGIN_RETRY_MINUTES', 15), 60)

  // 起点日のオフセット。[0, 7, 14, ...] の順に読む（今日 → 過去）。
  const lookbackDays    = envInt('SYNC_LOOKBACK_DAYS', 14)
  const lookbackOffsets = [0]
  for (let d = 7; d <= lookbackDays; d += 7) lookbackOffsets.push(d)

  // 対応付け済みの従業員一覧（admin は既存のローカル同期があるため既定で除外）
  const includeAdmin = process.argv.includes('--include-admin')
  const { data: therapists, error } = await supabase
    .from('therapists')
    .select('id, display_name, role, happ_worker_id')
    .eq('active', true)
    .not('happ_worker_id', 'is', null)
  if (error) throw new Error(`therapists: ${error.message}`)

  const targets = (therapists ?? []).filter(t => includeAdmin || t.role !== 'admin')
  if (targets.length === 0) {
    console.log('同期対象がいません（therapists.happ_worker_id を設定してください）')
    return
  }
  console.log(`同期対象: ${targets.length}名 / 起点: 今日${lookbackOffsets.slice(1).map(d => `・${d}日前`).join('')}`)

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security', '--no-sandbox'],
  })

  const syncedAt = new Date().toISOString()
  const now = new Date()
  let hadError = false

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page    = await context.newPage()

    for (let attempt = 0; ; attempt++) {
      try {
        await loginOwner(page)
        console.log(`✓ オーナーログイン成功${attempt > 0 ? `（${attempt}回目の再試行）` : ''}`)
        break
      } catch (err) {
        const msg  = err instanceof Error ? err.message : String(err)
        const diag = await safeDiagnose(page)
        console.error(`✗ ログイン失敗: ${msg}`)
        console.error(`  診断: ${diag}`)
        if (attempt < loginRetries) {
          console.log(`  ${loginRetryMinutes}分後に再試行します（残り ${loginRetries - attempt}回）`)
          await new Promise(r => setTimeout(r, loginRetryMinutes * 60_000))
          continue
        }
        await supabase.from('sync_logs').insert({
          synced_at:     syncedAt,
          source:        'owner-sync',
          error_message: `login: ${msg} | diag=${diag}`.slice(0, 500),
        })
        throw err
      }
    }

    // happ 上のセラピスト一覧と突き合わせ（対応付けの検証）
    const happList = await fetchTherapists(page)
    const happIds  = new Set(happList.map(t => t.workerId))

    for (const t of targets) {
      const workerId = t.happ_worker_id as number
      if (!happIds.has(workerId)) {
        console.log(`⚠ ${t.display_name}: happ_worker_id=${workerId} が happ 上に見つかりません。スキップ`)
        hadError = true
        continue
      }

      try {
        // 「今日」を起点にしたページに加え、7日ごとに遡った起点のページも読み、
        // order_id で統合してから1回だけ照合する（fetchOrdersForMonth と同じ考え方）。
        // 1ページの窓は起点の4日前から先なので、SYNC_LOOKBACK_DAYS=14 なら
        // おおむね18日前までの後入力・変更・削除を毎日拾える。
        const byOrderId = new Map<number, HappOrder>()
        // 照合範囲は「今日起点から遡って、正常に読めたページが連続している間」だけ広げる。
        // 途中のページが読めなかった（見出しなし／1件も取れない）場合、その窓と
        // それより古い窓は照合対象にしない。統合後の合計が 0 件でないと lib 側の
        // 安全弁が効かないため、ページ単位でここで守る。取れたオーダーは全ページ分 upsert する。
        const froms: string[] = []
        const tos:   string[] = []
        let rangeOpen = true
        const pageLog: string[] = []
        for (const offset of lookbackOffsets) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
          const parsed = await fetchOrdersForTherapist(page, workerId, {
            year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
          }, syncedAt)
          for (const o of parsed.orders) byOrderId.set(o.orderId, o)

          // 構造診断（顧客情報を含まない件数のみ）。失敗しても同期は続ける。
          const diag = await collectDiagnostics(page).catch(() => null)
          const ok = parsed.dateRange !== null && parsed.orders.length > 0
          pageLog.push(
            `${offset === 0 ? '今日' : `${offset}日前`}:` +
            `見出し${diag ? diag.dateHeaderCount : '?'}/ポップアップ${diag ? diag.modalCount : '?'}/取得${parsed.orders.length}` +
            (ok ? '' : '(照合対象外)'),
          )
          if (rangeOpen && ok && parsed.dateRange) {
            froms.push(parsed.dateRange.from)
            tos.push(parsed.dateRange.to)
          } else {
            rangeOpen = false
          }

          if (offset !== lookbackOffsets[lookbackOffsets.length - 1]) {
            await new Promise(r => setTimeout(r, 800 + Math.random() * 700))
          }
        }

        // "YYYY/MM/DD" は文字列順＝日付順なので sort で最小・最大が取れる
        const merged: ParsedDayOrders = {
          orders: [...byOrderId.values()],
          dateRange: froms.length > 0
            ? { from: [...froms].sort()[0], to: [...tos].sort()[tos.length - 1] }
            : null,
        }

        // 照合削除は両端の日を除く。
        // - 初日（窓の下端）: 05:00 より前に終わった深夜オーダーがページに載らないため、
        //   含めると「範囲内なのに取れなかった」と判定されて消える（8/25 02:00 の事故）。
        //   初日は前日の同期では非初日として照合済みなので、除いても検知漏れは実質ない。
        // - 最終日（窓の上端）: 切り方が未確認のため安全側で除く。
        const result = await upsertTherapistOrders(String(t.id), workerId, merged, {
          reconcileFrom: merged.dateRange ? dayAfter(merged.dateRange.from)    : undefined,
          reconcileTo:   merged.dateRange ? addDays(merged.dateRange.to, -1)   : undefined,
        })

        const range = result.reconciled ? `${result.reconciled.from}〜${result.reconciled.to}` : 'なし'
        console.log(
          `✓ ${t.display_name}: 取得 ${result.fetched}件 / 削除 ${result.removed}件` +
          ` | ${pageLog.join(' ')} | 照合範囲 ${range}` +
          (result.reconcileSkipped ? ` / ⚠ ${result.reconcileSkipped}` : ''),
        )

        await supabase.from('sync_logs').insert({
          synced_at:    syncedAt,
          orders_total: result.fetched,
          source:       'owner-sync',
          therapist_id: String(t.id),
        })
      } catch (err) {
        hadError = true
        const msg  = err instanceof Error ? err.message : String(err)
        // 顧客情報を含まない構造診断を付与（原因の遠隔特定用）
        const diag = await safeDiagnose(page)
        console.error(`✗ ${t.display_name}: ${msg}`)
        console.error(`  診断: ${diag}`)
        await supabase.from('sync_logs').insert({
          synced_at:     syncedAt,
          source:        'owner-sync',
          therapist_id:  String(t.id),
          error_message: `${msg} | diag=${diag}`.slice(0, 500),
        })
      }

      // happ への負荷配慮
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000))
    }
  } finally {
    await browser.close()
  }

  console.log(hadError ? '完了（一部エラーあり）' : '✅ 全員分の同期が完了しました')
  if (hadError) process.exit(1)
}

main().catch((err) => {
  console.error('致命的エラー:', err instanceof Error ? err.message : err)
  process.exit(1)
})
