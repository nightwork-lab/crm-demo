import { getCustomers, getLinks, getOrders } from '../lib/repository'
import { collectCandidates } from '../lib/customer-link'
import { getCustomerLifetimeStats } from '../lib/order-metrics'
import { isWriteBlocked } from '../lib/app-mode'
import CandidatesPanel from '../ui/candidates-panel'
import type { CustomerLinkMeta } from '../ui/link-customer-dialog'

export default async function CandidatesPage() {
  const [customers, links, allOrders] = await Promise.all([
    getCustomers(),
    getLinks(),
    getOrders(),
  ])
  const candidates    = collectCandidates(allOrders, links, customers)
  const readonly      = isWriteBlocked()
  const availableTags = [...new Set(customers.flatMap((c) => c.tags ?? []))]
    .sort((a, b) => a.localeCompare(b, 'ja'))

  // 同名顧客を区別できるよう、紐付けダイアログへ最終来店日・来店回数を渡す
  const statsMap = getCustomerLifetimeStats(allOrders, links, customers)
  const customerMeta: Record<string, CustomerLinkMeta> = Object.fromEntries(
    customers.map((c) => {
      const s = statsMap.get(c.id)
      return [c.id, {
        lastVisit:       s?.lastVisitDate ?? null,
        visitCount:      s?.visitCount ?? 0,
        nextReservation: s?.nextReservation ?? null,
      }]
    }),
  )

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <header>
        <p className="text-sm text-slate-700">管理</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">顧客登録候補</h1>
        <p className="text-sm text-slate-700 mt-1">
          happ-s.com に存在するが CRM に未登録の顧客です。happCustomerId 単位で表示しています。
        </p>
      </header>

      <CandidatesPanel
        candidates={candidates}
        customers={customers}
        customerMeta={customerMeta}
        availableTags={availableTags}
        isReadonly={readonly}
      />
    </div>
  )
}
