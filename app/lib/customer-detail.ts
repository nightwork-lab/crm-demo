import { getCustomers } from './repository/customers'
import { getLinks } from './repository/links'
import { getOrdersByHappCustomerIds } from './repository/orders'
import { resolveOrderCustomer, type LinkMethod } from './customer-link'
import { computeCustomerStats, type ComputedStats } from './customer-stats'
import type { HappOrder } from './happ-order'
import type { Customer } from './data'

// ---------- 型定義 ----------

/** HappOrder に linkMethod を加えたもの。来店履歴1件を表す。 */
export type LinkedOrder = HappOrder & {
  linkMethod: LinkMethod
}

export type CustomerWithOrders = {
  customer:     Customer
  linkedOrders: LinkedOrder[]
  /** happ オーダーから計算した集計値 */
  stats:        ComputedStats
}

// Re-export for convenience
export type { ComputedStats }

// ---------- メインクエリ ----------

/**
 * CRM customer.id に紐づく顧客情報と来店履歴を返す。
 * DATA_SOURCE=json → JSON キャッシュ読み取り
 * DATA_SOURCE=supabase → Supabase 読み取り
 */
export async function getCustomerWithOrders(
  crmCustomerId: string,
): Promise<CustomerWithOrders | null> {
  const [customers, links] = await Promise.all([getCustomers(), getLinks()])

  const customer = customers.find((c) => c.id === crmCustomerId)
  if (!customer) return null

  // この顧客に紐づく happ 顧客IDだけを取り出し、そのオーダーに限って取得する。
  // 以前は全オーダー（実測1386件・約513KB）を読んでから1名ぶんに絞っていた。
  // resolveOrderCustomer は links の happCustomerId 一致のみで判定するため
  // （名前一致は誤紐付け防止のため使わない）、この絞り込みは全件走査と等価。
  const happIds = links
    .filter((l) => l.crmCustomerId === crmCustomerId)
    .map((l) => l.happCustomerId)

  const scopedOrders = await getOrdersByHappCustomerIds(happIds)

  const linkedOrders: LinkedOrder[] = []
  for (const order of scopedOrders) {
    const result = resolveOrderCustomer(order, links, customers)
    if (result.type === 'linked' && result.customer.id === crmCustomerId) {
      linkedOrders.push({ ...order, linkMethod: result.method })
    }
  }

  linkedOrders.sort((a, b) => b.startTime.localeCompare(a.startTime))

  const stats = computeCustomerStats(linkedOrders)

  return { customer, linkedOrders, stats }
}
