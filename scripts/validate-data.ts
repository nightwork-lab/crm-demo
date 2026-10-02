/**
 * data/ 配下の JSON ファイルの整合性を検証する。
 * 実行: npm run validate:data
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATA_DIR = resolve(process.cwd(), 'data')

function readJson<T>(file: string): T | null {
  const path = resolve(DATA_DIR, file)
  if (!existsSync(path)) {
    console.log(`  [skip] ${file} が存在しません`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (e) {
    console.error(`  [ERROR] ${file} のパースに失敗: ${e}`)
    return null
  }
}

type Customer = { id: string; name: string; [k: string]: unknown }
type CustomerLink = { happCustomerId: number; crmCustomerId: string; [k: string]: unknown }
type HappOrder = { orderId: number; customerId: number; status: string; internalStatus: string; [k: string]: unknown }
type Prediction = { customerId: string; targetMonth: string; [k: string]: unknown }

const VALID_STATUSES   = new Set(['未確定', '確定済', '完了', 'キャンセル', '現金未確認'])
const VALID_INT_STATUS = new Set(['通常', '仮予約', '貸し切り', ''])

let errors = 0
let warnings = 0

function fail(msg: string)  { console.error(`  ✗ [ERROR]   ${msg}`); errors++ }
function warn(msg: string)  { console.warn (`  △ [WARN]    ${msg}`); warnings++ }
function ok  (msg: string)  { console.log  (`  ✓           ${msg}`) }

// ── customers.json ──────────────────────────────────────
console.log('\n[1] customers.json')
const customers = readJson<Customer[]>('customers.json')
if (customers) {
  if (!Array.isArray(customers)) {
    fail('配列ではありません')
  } else {
    const ids = customers.map(c => c.id)
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dupIds.length > 0) fail(`重複ID: ${[...new Set(dupIds)].join(', ')}`)
    else ok(`重複ID なし (${customers.length} 件)`)

    const noId = customers.filter(c => !c.id)
    if (noId.length > 0) fail(`id が空のレコード: ${noId.length} 件`)
    else ok('id が空のレコードなし')
  }
}

// ── customer-links.json ──────────────────────────────────
console.log('\n[2] customer-links.json')
const linksRaw = readJson<{ links?: CustomerLink[] } | CustomerLink[]>('customer-links.json')
const links: CustomerLink[] = Array.isArray(linksRaw)
  ? linksRaw
  : (linksRaw as { links?: CustomerLink[] })?.links ?? []

if (links.length > 0 || linksRaw !== null) {
  const happIds = links.map(l => l.happCustomerId)
  const dupHapp = happIds.filter((id, i) => happIds.indexOf(id) !== i)
  if (dupHapp.length > 0) fail(`happCustomerId 重複: ${[...new Set(dupHapp)].join(', ')}`)
  else ok(`happCustomerId 重複なし (${links.length} 件)`)

  const crmIds = new Set(customers?.map(c => c.id) ?? [])
  const orphanCrm = links.filter(l => crmIds.size > 0 && !crmIds.has(l.crmCustomerId))
  if (orphanCrm.length > 0)
    fail(`孤立 crmCustomerId (customers.json に存在しない): ${orphanCrm.map(l => l.crmCustomerId).join(', ')}`)
  else ok('孤立 crmCustomerId なし')
}

// ── happ-orders.json ─────────────────────────────────────
console.log('\n[3] happ-orders.json')
const ordersFile = readJson<{ orders?: HappOrder[] }>('happ-orders.json')
const orders = ordersFile?.orders ?? []

if (ordersFile) {
  const orderIds = orders.map(o => o.orderId)
  const dupOrders = orderIds.filter((id, i) => orderIds.indexOf(id) !== i)
  if (dupOrders.length > 0) fail(`orderId 重複 (${dupOrders.length} 件): ${[...new Set(dupOrders)].slice(0, 5).join(', ')}...`)
  else ok(`orderId 重複なし (${orders.length} 件)`)

  const unknownStatus = orders.filter(o => !VALID_STATUSES.has(o.status))
  if (unknownStatus.length > 0)
    warn(`未知の status: ${[...new Set(unknownStatus.map(o => o.status))].join(', ')} (${unknownStatus.length} 件)`)
  else ok('status 値 すべて既知')

  const unknownInt = orders.filter(o => !VALID_INT_STATUS.has(o.internalStatus ?? ''))
  if (unknownInt.length > 0)
    warn(`未知の internalStatus: ${[...new Set(unknownInt.map(o => o.internalStatus))].join(', ')} (${unknownInt.length} 件)`)
  else ok('internalStatus 値 すべて既知')

  // links と orders の happCustomerId 突き合わせ
  const orderHappIds = new Set(orders.map(o => o.customerId))
  const orphanLinks  = links.filter(l => !orderHappIds.has(l.happCustomerId))
  if (orphanLinks.length > 0)
    warn(`orders に存在しない happCustomerId (links): ${orphanLinks.map(l => l.happCustomerId).join(', ')}`)
  else ok('links の happCustomerId はすべて orders に存在')
}

// ── customer-predictions.json ─────────────────────────────
console.log('\n[4] customer-predictions.json')
const predFile = readJson<{ predictions?: Prediction[] }>('customer-predictions.json')
if (predFile) {
  const preds = predFile.predictions ?? []
  const keys  = preds.map(p => `${p.customerId}::${p.targetMonth}`)
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i)
  if (dupKeys.length > 0) fail(`重複 (customerId + targetMonth): ${[...new Set(dupKeys)].join(', ')}`)
  else ok(`重複なし (${preds.length} 件)`)

  const crmIds = new Set(customers?.map(c => c.id) ?? [])
  const orphanPred = crmIds.size > 0
    ? preds.filter(p => !crmIds.has(p.customerId))
    : []
  if (orphanPred.length > 0)
    warn(`孤立 customerId (customers.json に存在しない): ${[...new Set(orphanPred.map(p => p.customerId))].join(', ')}`)
  else ok('孤立 customerId なし')
}

// ── 総評 ────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━')
if (errors > 0)        console.error(`結果: ERROR ${errors} 件, WARN ${warnings} 件`)
else if (warnings > 0) console.warn (`結果: OK (WARN ${warnings} 件)`)
else                   console.log  ('結果: 異常なし ✓')
console.log('━━━━━━━━━━━━━━━━━━━━━━\n')

if (errors > 0) process.exit(1)
