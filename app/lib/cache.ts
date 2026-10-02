/**
 * Node.js プロセス内メモリキャッシュ（TTL: 30 秒）。
 * ページ横断で JSON 読み込み・集計が重複しないようにする。
 *
 * データを書き換える Server Action は invalidateDataCache() を呼ぶこと。
 */

import { readFileSync } from 'fs'
import { dataPath } from './data-dir'
import { loadCustomers } from './data'
import { loadCustomerLinks } from './customer-link'
import { getCustomerLifetimeStats, type ComputedStats } from './order-metrics'
export type { ComputedStats }
import { getFirstVisitDates } from './anniversary'
import type { Customer } from './data'
import type { CustomerLink } from './customer-link'
import type { HappOrder, HappOrdersFile } from './happ-order'

// ── TTL ──────────────────────────────────────────────────────────────

const TTL_MS = 30_000  // 30 秒

// ── Store ─────────────────────────────────────────────────────────────

type Entry<T> = { value: T; expiresAt: number }
const store = new Map<string, Entry<unknown>>()

const MISS = Symbol('MISS')

// ── Counters（検証用） ─────────────────────────────────────────────────

let _hits = 0, _misses = 0, _reads = 0, _computes = 0

export function getCacheStats() {
  return { hits: _hits, misses: _misses, filereads: _reads, computes: _computes, keys: store.size }
}

export function resetCacheStats() {
  _hits = 0; _misses = 0; _reads = 0; _computes = 0
}

// ── Low-level store ───────────────────────────────────────────────────

function getEntry<T>(key: string): T | typeof MISS {
  const entry = store.get(key) as Entry<T> | undefined
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key)
    _misses++
    return MISS
  }
  _hits++
  return entry.value
}

function setEntry<T>(key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now() + TTL_MS })
}

/** データを書き換える Server Action から呼ぶこと。 */
export function invalidateDataCache(): void {
  store.clear()
}

// ── Raw loaders ───────────────────────────────────────────────────────

function readHappOrdersFile(): HappOrdersFile | null {
  _reads++
  try {
    const raw = readFileSync(dataPath('happ-orders.json'), 'utf-8')
    return JSON.parse(raw) as HappOrdersFile
  } catch {
    return null
  }
}

// ── Public cached getters ─────────────────────────────────────────────

export function getCachedCustomers(): Customer[] {
  const v = getEntry<Customer[]>('customers')
  if (v !== MISS) return v
  _reads++
  const value = loadCustomers()
  setEntry('customers', value)
  return value
}

export function getCachedLinks(): CustomerLink[] {
  const v = getEntry<CustomerLink[]>('links')
  if (v !== MISS) return v
  _reads++
  const value = loadCustomerLinks()
  setEntry('links', value)
  return value
}

/** HappOrdersFile ごとキャッシュ（lastSyncedAt を含む）。 */
export function getCachedHappOrdersFile(): HappOrdersFile | null {
  const v = getEntry<HappOrdersFile | null>('happ-file')
  if (v !== MISS) return v          // null（ファイル未存在）もキャッシュ済みとして返す
  const value = readHappOrdersFile()
  setEntry('happ-file', value)
  return value
}

/** オーダー配列だけ必要な場合の便利関数。 */
export function getCachedOrders(): HappOrder[] {
  return getCachedHappOrdersFile()?.orders ?? []
}

/**
 * 顧客別全期間実績マップ。最初のアクセス時のみ計算し 30 秒間保持。
 * statsMap は today に依存しないほど実用的（来店確定日は変わらない）。
 */
export function getCachedStatsMap(): Map<string, ComputedStats> {
  const v = getEntry<Map<string, ComputedStats>>('stats-map')
  if (v !== MISS) return v
  _computes++
  const orders    = getCachedOrders()
  const links     = getCachedLinks()
  const customers = getCachedCustomers()
  const value     = getCustomerLifetimeStats(orders, links, customers)
  setEntry('stats-map', value)
  return value
}

/**
 * 顧客別初回来店日マップ。最初のアクセス時のみ計算し 30 秒間保持。
 */
export function getCachedFirstVisitMap(): Map<string, string> {
  const v = getEntry<Map<string, string>>('first-visit-map')
  if (v !== MISS) return v
  _computes++
  const orders    = getCachedOrders()
  const links     = getCachedLinks()
  const customers = getCachedCustomers()
  const value     = getFirstVisitDates(orders, links, customers)
  setEntry('first-visit-map', value)
  return value
}
