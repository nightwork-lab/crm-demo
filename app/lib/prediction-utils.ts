/** クライアント/サーバー両方で使える純粋なユーティリティ関数 */

/** "YYYY-MM" + n ヶ月前 → "YYYY-MM" */
export function prevMonthKey(monthKey: string, n = 1): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "YYYY-MM" + n ヶ月後 → "YYYY-MM" */
export function nextMonthKey(monthKey: string, n = 1): string {
  return prevMonthKey(monthKey, -n)
}

/** "YYYY-MM" → "YYYY年M月" */
export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  return `${y}年${parseInt(m, 10)}月`
}
