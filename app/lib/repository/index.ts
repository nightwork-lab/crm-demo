/**
 * repository 統合エントリポイント。
 * ページからはここを import して使う。
 * server side 専用。
 */
export { getCustomers } from './customers'
export { getOrders, getOrdersFile, getOrdersByHappCustomerIds } from './orders'
export { getLinks } from './links'
export { getSupabaseCounts, getSupabaseCustomersCount, getSupabaseOrdersCount, getSupabaseLinksCount, getSupabaseSyncLogsCount } from './supabase-read'

import { getCustomers } from './customers'
import { getOrdersFile } from './orders'
import { getLinks } from './links'
import { getCustomerLifetimeStats } from '../order-metrics'
import { getFirstVisitDates } from '../anniversary'
import type { Customer } from '../data'
import type { CustomerLink } from '../customer-link'
import type { HappOrder, HappOrdersFile } from '../happ-order'
import type { ComputedStats } from '../order-metrics'

export type AllData = {
  customers:     Customer[]
  links:         CustomerLink[]
  orders:        HappOrder[]
  happData:      HappOrdersFile | null
  statsMap:      Map<string, ComputedStats>
  firstVisitMap: Map<string, string>
}

/** 全データを並列ロードし、派生データ（statsMap/firstVisitMap）も計算して返す。 */
export async function getAllData(): Promise<AllData> {
  const [customers, links, happData] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrdersFile(),
  ])
  const orders        = happData?.orders ?? []
  const statsMap      = getCustomerLifetimeStats(orders, links, customers)
  const firstVisitMap = getFirstVisitDates(orders, links, customers)
  return { customers, links, orders, happData, statsMap, firstVisitMap }
}
