import { getCustomers, getLinks, getOrders } from '../lib/repository'
import { getCustomerLifetimeStats, type ComputedStats } from '../lib/order-metrics'
import CustomerSearch from '../ui/customer-search'

export default async function CustomersPage() {
  const [customers, links, orders] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrders(),
  ])
  const statsMap   = getCustomerLifetimeStats(orders, links, customers)
  const statsRecord: Record<string, ComputedStats> = Object.fromEntries(statsMap)

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-6xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">顧客一覧</h1>
        <p className="text-sm text-slate-700 mt-1">全{customers.length}名の顧客情報</p>
      </header>

      <CustomerSearch customers={customers} statsRecord={statsRecord} />
    </div>
  )
}
