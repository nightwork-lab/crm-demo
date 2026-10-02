/**
 * happ 同期のときに「どの月を照合し直すか」を決める。
 *
 * 同期ボタンは長らく当月しか照合していなかった。そのため月をまたいで同期が
 * 途切れると、前月は「もう当月ではない」ため二度と照合されず、穴が残ったまま
 * 固定される（2026-08 で実際に 10件 ¥458,700 が欠けた）。
 *
 * 最終同期日の月から今月までを返すことで、途切れた期間を自動で埋め直す。
 * 通常運用（毎日〜数日おきの同期）では当月1件だけを返すので挙動は変わらない。
 */

export type SyncMonth = { year: number; month: number }

/** 年月を通し番号に変換する（比較と加算を単純にするため）。 */
function toIndex(year: number, monthZeroBased: number): number {
  return year * 12 + monthZeroBased
}

/**
 * 照合すべき月を古い順に返す。
 *
 * @param lastSyncedAt 前回の同期日時（ISO8601）。未設定・不正なら当月のみ
 * @param now          現在時刻
 * @param maxMonths    遡る上限。長期間放置していた場合に happ へ過大な負荷を
 *                     かけないための安全弁。上限に当たる場合は**新しい側**を残す
 */
export function monthsToReconcile(
  lastSyncedAt: string | null | undefined,
  now: Date,
  maxMonths = 6,
): SyncMonth[] {
  const current: SyncMonth = { year: now.getFullYear(), month: now.getMonth() + 1 }
  if (!lastSyncedAt) return [current]

  const last = new Date(lastSyncedAt)
  if (Number.isNaN(last.getTime())) return [current]

  const currentIdx = toIndex(now.getFullYear(), now.getMonth())
  const lastIdx    = toIndex(last.getFullYear(), last.getMonth())

  // 同月内、または未来の日時が入っている場合は当月のみ
  if (lastIdx >= currentIdx) return [current]

  const startIdx = Math.max(lastIdx, currentIdx - (maxMonths - 1))
  const months: SyncMonth[] = []
  for (let i = startIdx; i <= currentIdx; i++) {
    months.push({ year: Math.floor(i / 12), month: (i % 12) + 1 })
  }
  return months
}

/** "2026/08" 形式の表示用ラベル。 */
export function formatSyncMonth({ year, month }: SyncMonth): string {
  return `${year}/${String(month).padStart(2, '0')}`
}
