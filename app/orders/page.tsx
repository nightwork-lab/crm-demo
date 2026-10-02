import { getCustomers, getLinks, getOrdersFile } from '../lib/repository'
import { resolveOrderCustomer } from '../lib/customer-link'
import { isCanceledOrder } from '../lib/order-metrics'
import type { MinOrder, OrderMonthGroup } from '../ui/happ-orders-panel'
import HappOrdersPanel from '../ui/happ-orders-panel'

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  return `${y}年${parseInt(m, 10)}月`
}

export default async function OrdersPage() {
  const [customers, links, happData] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrdersFile(),
  ])

  const orderGroups: OrderMonthGroup[] = (() => {
    if (!happData) return []

    const monthMap = new Map<string, {
      orders: MinOrder[]
      totalAmount: number
      linkedCount: number
    }>()

    for (const order of happData.orders) {
      const rawMonth = order.startTime.slice(0, 7)
      const monthKey = rawMonth.replace('/', '-')

      const result = resolveOrderCustomer(order, links, customers)

      const minOrder: MinOrder = {
        orderId:        order.orderId,
        customerName:   order.customerName,
        happCustomerId: order.customerId,
        startTime:      order.startTime,
        endTime:        order.endTime,
        course:         order.course,
        totalAmount:    order.totalAmount,
        therapistFee:   order.therapistFee,
        status:         order.status,
        paymentMethod:  order.paymentMethod,
        linkType:       result.type,
        ...(result.type === 'linked' ? {
          crmName:    result.customer.name,
          crmId:      result.customer.id,
          linkMethod: result.method,
        } : {}),
      }

      const isCancel = isCanceledOrder(order)
      const entry = monthMap.get(monthKey)
      if (entry) {
        entry.orders.push(minOrder)
        if (!isCancel) {
          entry.totalAmount += order.totalAmount
          if (result.type === 'linked') entry.linkedCount++
        }
      } else {
        monthMap.set(monthKey, {
          orders:      [minOrder],
          totalAmount: isCancel ? 0 : order.totalAmount,
          linkedCount: (!isCancel && result.type === 'linked') ? 1 : 0,
        })
      }
    }

    return [...monthMap.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, data]) => ({
        monthKey,
        monthLabel:     formatMonthLabel(monthKey),
        totalAmount:    data.totalAmount,
        linkedCount:    data.linkedCount,
        candidateCount: data.orders.length - data.linkedCount,
        orders:         data.orders.sort((a, b) => b.startTime.localeCompare(a.startTime)),
      }))
  })()

  const linkedTotal    = orderGroups.reduce((s, g) => s + g.linkedCount, 0)
  const candidateTotal = orderGroups.reduce((s, g) => s + g.candidateCount, 0)

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">外部オーダー</h1>
        <p className="text-sm text-slate-700 mt-1">
          happ-s.com から取得したオーダー一覧 · 月別表示
        </p>
      </header>

      {!happData ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-700">データがありません</p>
          <p className="mt-1 text-sm text-slate-700">同期/管理ページから同期してください</p>
        </div>
      ) : (
        <HappOrdersPanel
          groups={orderGroups}
          syncedAt={happData.lastSyncedAt}
          linkedTotal={linkedTotal}
          candidateTotal={candidateTotal}
        />
      )}
    </div>
  )
}
