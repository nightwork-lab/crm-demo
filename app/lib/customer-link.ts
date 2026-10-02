import { readFileSync } from 'fs'
import { dataPath } from './data-dir'
import type { Customer } from './data'
import type { HappOrder } from './happ-order'

// ---------- 型定義 ----------

/**
 * 紐付け方法。DB移行時は customer_links.linked_by カラムの ENUM になる。
 * manual   : data/customer-links.json に手動登録
 * alias    : name-aliases.ts の辞書経由
 * name_match: CRM の name と完全一致
 */
export type LinkMethod = 'manual' | 'alias' | 'name_match'

/**
 * happ customerId と CRM customer.id の対応レコード。
 * DB移行時は customer_links テーブルの1行になる。
 */
export type CustomerLink = {
  happCustomerId: number  // happ-s.com 上の顧客ID（主キー側）
  crmCustomerId: string   // CRM の customer.id
  linkedAt: string        // 紐付け日時 ISO8601
  linkedBy: LinkMethod
  note?: string           // 紐付け理由メモ（任意）
}

export type CustomerLinksFile = {
  links: CustomerLink[]
}

/**
 * オーダー1件に対する解決結果。
 * linked   : CRM 顧客に紐付き済み → 来店履歴候補として扱う
 * candidate: 未紐付き              → 顧客登録候補として扱う
 */
export type LinkResult =
  | { type: 'linked';    customer: Customer; method: LinkMethod }
  | { type: 'candidate'; happCustomerId: number; customerName: string }

// ---------- ロード ----------

export function loadCustomerLinks(): CustomerLink[] {
  try {
    const raw  = readFileSync(dataPath('customer-links.json'), 'utf-8')
    const file = JSON.parse(raw) as CustomerLinksFile
    return file.links ?? []
  } catch {
    return []
  }
}

// ---------- 解決ロジック ----------

/**
 * オーダー1件に対して CRM 顧客を解決する。
 *
 * 判定ルール（happCustomerId を唯一の紐付けキーとして使用）:
 *   1. customer-links.json に happCustomerId が存在する → linked
 *   2. それ以外 → candidate（顧客登録候補）
 *
 * 【重要】名前一致は使用しない。
 *   同名でも happCustomerId が異なる顧客は別人として扱う。
 *   名前一致は UI のヒント表示のみに利用する（name-resolver.ts を参照）。
 */
export function resolveOrderCustomer(
  order: HappOrder,
  links: CustomerLink[],
  customers: Customer[],
): LinkResult {
  if (order.customerId > 0) {
    const link = links.find((l) => l.happCustomerId === order.customerId)
    if (link) {
      const customer = customers.find((c) => c.id === link.crmCustomerId)
      if (customer) {
        return { type: 'linked', customer, method: link.linkedBy }
      }
    }
  }

  // 未紐付け（名前一致は使わない → 同名別人の誤紐付け防止）
  return {
    type: 'candidate',
    happCustomerId: order.customerId,
    customerName: order.customerName,
  }
}

/**
 * オーダーリストから顧客登録候補（未紐付きの happ 顧客）を集約する。
 * happCustomerId 単位で重複排除し、最新オーダー情報を代表値として使う。
 */
export type RegistrationCandidate = {
  happCustomerId: number
  customerName: string
  orderCount: number
  latestStartTime: string
  totalAmount: number
}

export function collectCandidates(
  orders: HappOrder[],
  links: CustomerLink[],
  customers: Customer[],
): RegistrationCandidate[] {
  const map = new Map<string, RegistrationCandidate>()

  for (const order of orders) {
    const result = resolveOrderCustomer(order, links, customers)
    if (result.type !== 'candidate') continue

    // happCustomerId が 0 の場合は customerName をキーに使う
    const key = order.customerId > 0
      ? `id:${order.customerId}`
      : `name:${order.customerName}`

    const existing = map.get(key)
    if (existing) {
      existing.orderCount++
      existing.totalAmount += order.totalAmount
      if (order.startTime > existing.latestStartTime) {
        existing.latestStartTime = order.startTime
        existing.customerName    = order.customerName
      }
    } else {
      map.set(key, {
        happCustomerId: order.customerId,
        customerName:   order.customerName,
        orderCount:     1,
        latestStartTime: order.startTime,
        totalAmount:    order.totalAmount,
      })
    }
  }

  return [...map.values()].sort((a, b) =>
    b.latestStartTime.localeCompare(a.latestStartTime),
  )
}
