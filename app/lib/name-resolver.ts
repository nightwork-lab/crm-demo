import { NAME_ALIASES } from './name-aliases'
import type { Customer } from './data'

export type MatchType = 'exact' | 'alias'

export type MatchResult = {
  customer: Customer
  matchType: MatchType
}

/**
 * 外部サイトの名前表記を正規化する。
 * 辞書に登録されていれば alias 変換、なければそのまま返す。
 */
export function resolveOrderName(rawName: string): {
  normalized: string
  matchType: MatchType
} {
  const trimmed = rawName.trim()
  const alias = NAME_ALIASES[trimmed]
  if (alias) {
    return { normalized: alias, matchType: 'alias' }
  }
  return { normalized: trimmed, matchType: 'exact' }
}

/**
 * 外部オーダーの顧客名を CRM の顧客一覧と照合する。
 * マッチしなければ null（= 新規候補）。
 */
export function matchCustomer(
  orderName: string,
  customers: Customer[]
): MatchResult | null {
  const { normalized, matchType } = resolveOrderName(orderName)
  const customer = customers.find((c) => c.name === normalized)
  if (!customer) return null
  return { customer, matchType }
}
