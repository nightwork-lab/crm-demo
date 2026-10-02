/**
 * JSONデータを Supabase へインポートするスクリプト。
 *
 * dry-run（デフォルト）: 件数確認のみ。Supabase への書き込みなし。
 * 実投入:               --confirm フラグが必要。
 *
 * 実行例:
 *   npm run import:supabase           # dry-run
 *   npm run import:supabase:confirm   # 実投入
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const CONFIRM = process.argv.includes('--confirm')

// ── env チェック ─────────────────────────────────────────────────────

function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`環境変数 ${key} が設定されていません`)
  return v
}

// ── JSON ロード ───────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = resolve(process.cwd(), 'data', filename)
  const raw  = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as T
}

// ── 型定義（変換後） ─────────────────────────────────────────────────

type DbCustomer = {
  id: string
  name: string
  memo: string
  tags: string[]
  last_visit: string | null
  total_sales: number
  repeat_count: number
  alert_excluded: boolean
  alert_exclude_reason: string | null
  birthday: string | null
  anniversary_excluded: boolean
  next_reservation: string | null
}

type DbHappOrder = {
  order_id: number
  customer_id: number
  customer_name: string
  start_time: string
  end_time: string
  course: string
  payment_method: string
  status: string
  internal_status: string
  total_amount: number
  therapist_fee: number
  source: string
  synced_at: string
}

type DbCustomerLink = {
  happ_customer_id: number
  crm_customer_id: string
  linked_at: string
  linked_by: string
  note: string | null
}

// ── データ変換 ────────────────────────────────────────────────────────

function convertCustomers(raw: unknown[]): DbCustomer[] {
  return raw.map((c: any) => ({
    id:                   c.id,
    name:                 c.name,
    memo:                 c.memo ?? '',
    tags:                 Array.isArray(c.tags) ? c.tags : [],
    last_visit:           c.lastVisit ?? null,
    total_sales:          c.totalSales ?? 0,
    repeat_count:         c.repeatCount ?? 0,
    alert_excluded:       c.alertExcluded ?? false,
    alert_exclude_reason: c.alertExcludeReason ?? null,
    birthday:             c.birthday ?? null,
    anniversary_excluded: c.anniversaryExcluded ?? false,
    next_reservation:     c.nextReservation ?? null,
  }))
}

function convertHappOrders(raw: unknown[]): DbHappOrder[] {
  return raw.map((o: any) => ({
    order_id:         o.orderId,
    customer_id:      o.customerId,
    customer_name:    o.customerName,
    start_time:       o.startTime,
    end_time:         o.endTime ?? '',
    course:           o.course ?? '',
    payment_method:   o.paymentMethod ?? '',
    status:           o.status ?? '',
    internal_status:  o.internalStatus ?? '',
    total_amount:     o.totalAmount ?? 0,
    therapist_fee:    o.therapistFee ?? 0,
    source:           o.source,
    synced_at:        o.syncedAt,
  }))
}

function convertCustomerLinks(raw: unknown[]): DbCustomerLink[] {
  return raw.map((l: any) => ({
    happ_customer_id: l.happCustomerId,
    crm_customer_id:  l.crmCustomerId,
    linked_at:        l.linkedAt,
    linked_by:        l.linkedBy,
    note:             l.note ?? null,
  }))
}

// ── upsert（バッチ分割） ──────────────────────────────────────────────

const BATCH = 500

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsert<T extends object>(
  supabase: ReturnType<typeof createClient<any, any>>,
  table: string,
  rows: T[],
  conflictKey: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from(table)
      .upsert(chunk as any[], { onConflict: conflictKey })
    if (error) throw new Error(`[${table}] upsert失敗: ${error.message}`)
  }
}

// ── メイン ────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(50))
  console.log(`モード: ${CONFIRM ? '【実投入】' : '【dry-run】'}`)
  console.log('='.repeat(50))

  // env確認（値は表示しない）
  const missingKeys: string[] = []
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[key]) missingKeys.push(key)
  }
  if (missingKeys.length > 0) {
    console.error(`エラー: 以下の環境変数が未設定です: ${missingKeys.join(', ')}`)
    process.exit(1)
  }
  console.log('✓ envキー確認済み: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')

  // JSONロード・変換
  const customersRaw   = (loadJson<{ [k: string]: unknown[] }>('customers.json') as any)
  const happOrdersRaw  = (loadJson<{ orders: unknown[] }>('happ-orders.json')).orders
  const linksRaw       = (loadJson<{ links: unknown[] }>('customer-links.json')).links

  // customersはarrayまたはそのまま
  const customersArray = Array.isArray(customersRaw) ? customersRaw : []
  const customers      = convertCustomers(customersArray)
  const happOrders     = convertHappOrders(happOrdersRaw)
  const links          = convertCustomerLinks(linksRaw)

  console.log('')
  console.log('── 件数確認 ──')
  console.log(`  customers     : ${customers.length} 件`)
  console.log(`  happ_orders   : ${happOrders.length} 件`)
  console.log(`  customer_links: ${links.length} 件`)

  if (!CONFIRM) {
    console.log('')
    console.log('dry-run完了。Supabaseへの書き込みは行っていません。')
    console.log('実投入する場合: npm run import:supabase:confirm')
    return
  }

  // 実投入
  const url     = getRequiredEnv('SUPABASE_URL')
  const roleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, roleKey, { auth: { persistSession: false } })

  const started = Date.now()

  console.log('')
  console.log('── 実投入開始 ──')

  let step = 'customers'
  try {
    console.log(`  [1/3] ${step} を投入中...`)
    await upsert(supabase, 'customers', customers, 'id')
    console.log(`  ✓ customers ${customers.length} 件`)

    step = 'happ_orders'
    console.log(`  [2/3] ${step} を投入中...`)
    await upsert(supabase, 'happ_orders', happOrders, 'order_id')
    console.log(`  ✓ happ_orders ${happOrders.length} 件`)

    step = 'customer_links'
    console.log(`  [3/3] ${step} を投入中...`)
    await upsert(supabase, 'customer_links', links, 'happ_customer_id')
    console.log(`  ✓ customer_links ${links.length} 件`)

    const durationMs = Date.now() - started
    const { error: logErr } = await supabase.from('sync_logs').insert({
      synced_at:      new Date().toISOString(),
      orders_total:   happOrders.length,
      orders_new:     happOrders.length,
      orders_updated: 0,
      duration_ms:    durationMs,
      error_message:  null,
      source:         'import-supabase',
    })
    if (logErr) console.warn(`  ⚠ sync_logs 記録失敗: ${logErr.message}`)
    else        console.log(`  ✓ sync_logs 記録完了 (${durationMs}ms)`)

    console.log('')
    console.log('実投入完了。')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - started
    await supabase.from('sync_logs').insert({
      synced_at:     new Date().toISOString(),
      duration_ms:   durationMs,
      error_message: `[${step}] ${msg}`,
      source:        'import-supabase',
    }).then(() => {})
    console.error('')
    console.error(`エラー: ${step} テーブルで失敗しました`)
    console.error(msg)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('予期しないエラー:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
