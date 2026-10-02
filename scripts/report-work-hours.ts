/**
 * セラピストとしての稼働時間を happ オーダーから集計する（読み取り専用）。
 *
 *   npm run report:hours                 # 月別
 *   npm run report:hours -- --weekly     # 週別（月曜始まり）
 *   npm run report:hours -- --json       # JSON で出力（稼働ログへの取り込み用）
 *
 * - キャンセル・仮予約は除外（order-metrics.ts の isBookableOrder と同じ基準）
 * - 稼働時間 = 終了時刻 − 開始時刻。終了が空ならコース名の「NN分」から補完
 * - 顧客名・メモ・金額は出力しない（件数と時間のみ）
 * - DATA_DIR に従う（未設定なら data/）
 */
import { readFileSync } from 'fs'
import { dataPath } from '../app/lib/data-dir'
import { isBookableOrder } from '../app/lib/order-metrics'
import type { HappOrdersFile } from '../app/lib/happ-order'

const args   = process.argv.slice(2)
const WEEKLY = args.includes('--weekly')
const JSON_OUT = args.includes('--json')

const file = JSON.parse(readFileSync(dataPath('happ-orders.json'), 'utf-8')) as HappOrdersFile
const today = new Date()

function parse(s: string): Date | null {
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
}
function weekStart(d: Date): string {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

type Bucket = { key: string; count: number; hours: number; days: Set<string> }
const buckets = new Map<string, Bucket>()

for (const o of file.orders) {
  if (!isBookableOrder(o)) continue
  const start = parse(o.startTime)
  if (!start || start > today) continue           // 未来の予約は含めない
  let end = o.endTime ? parse(o.endTime) : null
  if (!end) {
    const mm = o.course.match(/(\d+)\s*分/)
    if (!mm) continue
    end = new Date(start.getTime() + Number(mm[1]) * 60_000)
  }
  const hours = (end.getTime() - start.getTime()) / 3_600_000
  if (!(hours > 0) || hours > 24) continue
  const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  const key = WEEKLY ? weekStart(start) : day.slice(0, 7)
  const b = buckets.get(key) ?? { key, count: 0, hours: 0, days: new Set() }
  b.count++; b.hours += hours; b.days.add(day)
  buckets.set(key, b)
}

const rows = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
  .map((b) => ({ period: b.key, orders: b.count, hours: Math.round(b.hours * 4) / 4, days: b.days.size }))

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log(WEEKLY ? '週（月曜始まり）   件数   稼働h   出勤日' : '月         件数   稼働h   出勤日')
  for (const r of rows) console.log(`${r.period.padEnd(12)} ${String(r.orders).padStart(4)}  ${String(r.hours).padStart(6)}  ${String(r.days).padStart(5)}`)
  const last3 = rows.slice(-3)
  if (last3.length) {
    const h = last3.reduce((s, r) => s + r.hours, 0) / last3.length
    console.log(`\n直近 ${last3.length} 期間の平均: ${Math.round(h * 4) / 4} h / 期間`)
  }
}
