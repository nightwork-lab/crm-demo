/**
 * data/ 配下の JSON ファイルをタイムスタンプ付きで data/backups/ にコピーする。
 * 実行: npm run backup:data
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, basename } from 'path'

const DATA_DIR   = resolve(process.cwd(), 'data')
const BACKUP_DIR = resolve(DATA_DIR, 'backups')

const TARGETS = [
  'customers.json',
  'customer-links.json',
  'happ-orders.json',
  'customer-predictions.json',
]

function timestamp(): string {
  const now = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

function main(): void {
  mkdirSync(BACKUP_DIR, { recursive: true })

  const ts = timestamp()
  let backed = 0
  let skipped = 0

  for (const file of TARGETS) {
    const src = resolve(DATA_DIR, file)
    if (!existsSync(src)) {
      console.log(`  skip  ${file} (存在しない)`)
      skipped++
      continue
    }
    const name = basename(file, '.json')
    const dest = resolve(BACKUP_DIR, `${ts}_${name}.json`)
    copyFileSync(src, dest)
    console.log(`  saved ${dest}`)
    backed++
  }

  console.log(`\nバックアップ完了: ${backed} 件保存, ${skipped} 件スキップ`)
  console.log(`保存先: ${BACKUP_DIR}`)
}

main()
