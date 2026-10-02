/**
 * デモ用ダミーデータ生成スクリプト。
 *
 *   npm run demo:generate                # data/demo/ に生成
 *   npm run demo:generate -- --today=2026-10-01 --force
 *
 * - 出力先は DATA_DIR（既定 data/demo）。安全のため `data` そのものには書かない。
 * - 既にファイルがある場合は --force がなければ中断する。
 * - 乱数は固定シードなので、同じ today なら毎回同じデータになる。
 * - 実データ（data/*.json）は一切読まない。
 *
 * 生成する顧客の内訳（合計 36 名）
 *   常連 10 / 離れそう 8 / 休眠 6 / 新規 6 / 未紐付け候補 3 / 誕生日が近い 3
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ---------- 引数 ----------
const args = process.argv.slice(2)
const argOf = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const FORCE = args.includes('--force')
const TODAY = argOf('today') ?? new Date().toISOString().slice(0, 10)

const outDir = resolve(process.cwd(), process.env.DATA_DIR ?? 'data/demo')
if (outDir === resolve(process.cwd(), 'data')) {
  console.error('中断: 出力先が data/ そのものです。DATA_DIR に data/demo などを指定してください。')
  process.exit(1)
}
if (existsSync(outDir) && readdirSync(outDir).some((f) => f.endsWith('.json')) && !FORCE) {
  console.error(`中断: ${outDir} に既に JSON が存在します。上書きするには --force を付けてください。`)
  process.exit(1)
}

// ---------- 乱数（固定シード） ----------
let seed = 20260930
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))

// ---------- 日付ユーティリティ ----------
const base = new Date(TODAY + 'T12:00:00')
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
const ymd  = (d: Date) => d.toISOString().slice(0, 10)
const pad  = (n: number) => String(n).padStart(2, '0')
function happTime(d: Date, hh: number, mm: number): string {
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(hh)}:${pad(mm)}`
}
const monthKey = (d: Date) => ymd(d).slice(0, 7)

// ---------- マスタ ----------
const SURNAMES = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水','山崎','森','池田','橋本','阿部','石川','山下','中島','石井','小川','前田','岡田','長谷川','藤田','後藤','近藤','村上','遠藤','青木','坂本']
const GIVEN    = ['桜','美咲','葵','結衣','陽菜','凛','美月','杏','花','彩乃','真央','愛','千夏','莉子','若菜','琴音','沙羅','瑞希','奈々','光','理沙','優花','紗英','菜月','明日香','未来','詩織','夏美','麻衣','由紀']
const COURSES: { name: string; minutes: number; price: number }[] = [
  { name: '90分コース',  minutes: 90,  price: 18000 },
  { name: '120分コース', minutes: 120, price: 24000 },
  { name: '150分コース', minutes: 150, price: 30000 },
  { name: '180分コース', minutes: 180, price: 36000 },
]
const AREAS    = ['新宿', '渋谷', '池袋', '横浜', '大宮', '品川']
const PAYMENTS = ['現金', 'クレジット', 'PayPay']
const MEMOS = [
  'お酒は弱め。紅茶が好き',
  '終電を気にするので 23 時までに終えたい',
  '誕生日は控えめに祝ってほしいとのこと',
  '前回は仕事の相談が中心だった',
  '猫を飼っている（名前：もち）',
  '甘いものが好き。差し入れはマカロン',
  '香水は苦手。無香料で',
  '月末は仕事が忙しい。月初に連絡するとつながりやすい',
  '記念日は初回の日を大事にしている',
  '静かな店を好む。にぎやかな場所は避ける',
  '旅行の話題が好き。最近は台湾に行った',
  '電話より LINE の方が返事が早い',
]
const TAGS = [['常連'], ['常連', 'VIP'], ['新規'], ['要フォロー'], [], ['紹介'], ['遠方']]

// ---------- 型（アプリ側の型と同じ形。読み込み側の型定義は app/lib を参照） ----------
type Order = {
  orderId: number; customerId: number; customerName: string
  startTime: string; endTime: string; course: string; area: string
  paymentMethod: string; status: string; internalStatus: string
  totalAmount: number; therapistFee: number; source: 'orderList'; syncedAt: string
}
type Customer = {
  id: string; name: string; lastVisit: string; totalSales: number; repeatCount: number
  nextReservation?: string; memo: string; tags?: string[]; birthday?: string; updatedAt: string
}

// ---------- 生成 ----------
type Segment = 'regular' | 'lapsing' | 'dormant' | 'new' | 'candidate' | 'birthday'
const PLAN: [Segment, number][] = [['regular', 10], ['lapsing', 8], ['dormant', 6], ['new', 6], ['candidate', 3], ['birthday', 3]]

const usedNames = new Set<string>()
function newName(): string {
  for (;;) {
    const n = `${pick(SURNAMES)} ${pick(GIVEN)}`
    if (!usedNames.has(n)) { usedNames.add(n); return n }
  }
}

const orders: Order[] = []
const customers: Customer[] = []
const links: { happCustomerId: number; crmCustomerId: string; linkedAt: string; linkedBy: 'manual'; note?: string }[] = []
let orderId = 500001
let happCustomerId = 1001
let crmId = 1
const syncedAt = new Date(base.getTime() - 3 * 3600 * 1000).toISOString()

function addOrder(cid: number, name: string, day: Date, future = false, cancel = false): Order {
  const c  = pick(COURSES)
  const hh = between(13, 22), mm = pick([0, 30])
  const end = new Date(day); end.setHours(hh, mm + c.minutes)
  const status = cancel ? 'キャンセル' : future ? '確定' : '完了'
  const o: Order = {
    orderId: orderId++, customerId: cid, customerName: name,
    startTime: happTime(day, hh, mm), endTime: happTime(end, end.getHours(), end.getMinutes()),
    course: c.name, area: pick(AREAS), paymentMethod: pick(PAYMENTS),
    status, internalStatus: status,
    totalAmount: c.price, therapistFee: Math.round(c.price * 0.55),
    source: 'orderList', syncedAt,
  }
  orders.push(o)
  return o
}

/** interval 日おきに from〜to の来店を作る */
function visitsBetween(cid: number, name: string, fromDaysAgo: number, toDaysAgo: number, interval: [number, number]) {
  let d = addDays(base, -fromDaysAgo)
  const limit = addDays(base, -toDaysAgo)
  while (d <= limit) {
    const cancel = rand() < 0.04
    addOrder(cid, name, d, false, cancel)
    d = addDays(d, between(interval[0], interval[1]))
  }
}

for (const [segment, count] of PLAN) {
  for (let i = 0; i < count; i++) {
    const name = newName()
    const hid  = happCustomerId++
    let birthday: string | undefined

    switch (segment) {
      case 'regular':
        visitsBetween(hid, name, between(300, 400), between(3, 14), [9, 20])
        if (rand() < 0.5) addOrder(hid, name, addDays(base, between(1, 12)), true)
        break
      case 'lapsing':
        visitsBetween(hid, name, between(240, 360), between(40, 75), [10, 18])
        break
      case 'dormant':
        visitsBetween(hid, name, between(360, 420), between(120, 240), [14, 30])
        break
      case 'new':
        visitsBetween(hid, name, between(10, 45), between(2, 9), [7, 20])
        break
      case 'candidate':
        // 紐付け前の新規客。オーダーだけあり、CRM 顧客は作らない
        addOrder(hid, name, addDays(base, -between(1, 6)))
        continue
      case 'birthday': {
        visitsBetween(hid, name, between(200, 300), between(5, 20), [12, 24])
        const bd = addDays(base, i)  // 今日・明日・明後日
        birthday = `${pad(bd.getMonth() + 1)}-${pad(bd.getDate())}`
        break
      }
    }

    if (!birthday && rand() < 0.6) {
      const bd = addDays(base, between(10, 360))
      birthday = `${pad(bd.getMonth() + 1)}-${pad(bd.getDate())}`
    }

    const own = orders.filter((o) => o.customerId === hid && o.status !== 'キャンセル')
    const past = own.filter((o) => o.status === '完了')
    const future = own.filter((o) => o.status === '確定')
    const last = past.map((o) => o.startTime.slice(0, 10).replace(/\//g, '-')).sort().at(-1)!
    const id = String(crmId++)
    customers.push({
      id, name, lastVisit: last,
      totalSales: past.reduce((s, o) => s + o.totalAmount, 0),
      repeatCount: past.length,
      nextReservation: future[0]?.startTime.slice(0, 10).replace(/\//g, '-'),
      memo: pick(MEMOS),
      tags: segment === 'new' ? ['新規'] : segment === 'lapsing' ? ['要フォロー'] : pick(TAGS),
      birthday,
      updatedAt: syncedAt,
    })
    links.push({ happCustomerId: hid, crmCustomerId: id, linkedAt: syncedAt, linkedBy: 'manual', note: 'デモデータ' })
  }
}

orders.sort((a, b) => a.startTime.localeCompare(b.startTime))

// ---------- 月間目標・予測 ----------
const targets = [-2, -1, 0, 1].map((m) => ({
  targetMonth: monthKey(addMonths(base, m)),
  targetRevenue: 1_500_000 + m * 100_000,
  updatedAt: syncedAt,
}))
const thisMonth = monthKey(base)
const predictions = customers
  .filter((c) => !c.tags?.includes('新規'))
  .slice(0, 12)
  .map((c, i) => ({
    customerId: c.id, targetMonth: thisMonth,
    predictedVisits: between(1, 3), predictedRevenue: between(1, 3) * 24000,
    memo: i % 3 === 0 ? '月初に連絡予定' : '',
    followUpStatus: i % 4 === 0 ? 'contacted' : i % 4 === 1 ? 'needs_contact' : undefined,
    updatedAt: syncedAt,
  }))

// ---------- 書き出し ----------
mkdirSync(outDir, { recursive: true })
const write = (f: string, v: unknown) => writeFileSync(resolve(outDir, f), JSON.stringify(v, null, 2) + '\n', 'utf-8')
write('customers.json', customers)
write('happ-orders.json', { lastSyncedAt: syncedAt, orders })
write('customer-links.json', { links })
write('monthly-targets.json', { targets })
write('customer-predictions.json', { predictions })

console.log(`生成完了: ${outDir}`)
console.log(`  today=${TODAY} 顧客 ${customers.length} 名 / オーダー ${orders.length} 件 / 紐付け ${links.length} 件 / 未紐付け候補 ${PLAN.find(([s]) => s === 'candidate')![1]} 名`)
