/**
 * data/backups/ から data/ へバックアップを復元する。
 *
 * 使い方:
 *   npm run restore:data -- --help
 *   npm run restore:data -- --list
 *   npm run restore:data -- --latest
 *   npm run restore:data -- --latest --confirm
 *   npm run restore:data -- --timestamp 20260520_124924
 *   npm run restore:data -- --timestamp 20260520_124924 --confirm
 *
 * 注意:
 *   --confirm を付けない限り dry-run（実際には何も変更しない）。
 *   復元前に現在の data/ を自動バックアップする。
 *   .env.local は絶対に対象にしない。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs'
import { resolve, basename } from 'path'

const DATA_DIR   = resolve(process.cwd(), 'data')
const BACKUP_DIR = resolve(DATA_DIR, 'backups')

const RESTORE_TARGETS = [
  'customers.json',
  'customer-links.json',
  'happ-orders.json',
  'customer-predictions.json',
]

// ── 引数パース ────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const has  = (flag: string) => args.includes(flag)
const get  = (flag: string) => {
  const i = args.indexOf(flag)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null
}

// ── バックアップ一覧 ──────────────────────────────────────────────────

type BackupSet = {
  timestamp: string        // "YYYYMMDD_HHMMSS"
  label:     string        // "2026/05/20 12:49:24"
  files:     string[]      // ファイル名（e.g. "customers.json"）
}

function listBackupSets(): BackupSet[] {
  if (!existsSync(BACKUP_DIR)) return []

  const all = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'))
  const map = new Map<string, string[]>()

  for (const file of all) {
    const m = file.match(/^(\d{8}_\d{6})_(.+\.json)$/)
    if (!m) continue
    const [, ts, name] = m
    const list = map.get(ts) ?? []
    list.push(name)
    map.set(ts, list)
  }

  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ts, files]) => ({
      timestamp: ts,
      label:     formatTimestamp(ts),
      files,
    }))
}

function formatTimestamp(ts: string): string {
  // "20260520_124924" → "2026/05/20 12:49:24"
  const [date, time] = ts.split('_')
  return `${date.slice(0,4)}/${date.slice(4,6)}/${date.slice(6,8)} ${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4,6)}`
}

// ── 自動バックアップ ─────────────────────────────────────────────────

function autoBackup(ts: string): void {
  mkdirSync(BACKUP_DIR, { recursive: true })

  let backed = 0
  for (const file of RESTORE_TARGETS) {
    const src = resolve(DATA_DIR, file)
    if (!existsSync(src)) continue
    const dest = resolve(BACKUP_DIR, `${ts}_${basename(file, '.json')}.json`)
    copyFileSync(src, dest)
    backed++
  }
  console.log(`  自動バックアップ完了: ${backed} 件 (ts: ${ts})`)
}

// ── 復元実行 ─────────────────────────────────────────────────────────

function restoreSet(set: BackupSet, confirm: boolean): void {
  console.log(`\n対象バックアップ: ${set.label} (${set.timestamp})`)
  console.log('─'.repeat(52))

  const plan: Array<{ src: string; dest: string; name: string }> = []

  for (const targetFile of RESTORE_TARGETS) {
    if (!set.files.includes(targetFile)) {
      console.log(`  skip  ${targetFile} (バックアップに存在しない)`)
      continue
    }
    const name = basename(targetFile, '.json')
    const src  = resolve(BACKUP_DIR, `${set.timestamp}_${name}.json`)
    const dest = resolve(DATA_DIR, targetFile)
    const exists = existsSync(dest)
    plan.push({ src, dest, name: targetFile })
    console.log(`  ${exists ? '上書き' : '新規  '} ${targetFile}`)
  }

  if (plan.length === 0) {
    console.log('\n復元対象ファイルがありません。')
    return
  }

  if (!confirm) {
    console.log('\n[dry-run] 実際には変更しません。')
    console.log('復元を実行するには --confirm を追加してください:')
    const tsArg = has('--latest') ? '--latest' : `--timestamp ${set.timestamp}`
    console.log(`  npm run restore:data -- ${tsArg} --confirm`)
    return
  }

  // 自動バックアップ（今の data/ を保存してから上書き）
  const now = new Date()
  const autoTs =
    `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}` +
    `_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
  console.log(`\n現在の data/ を事前バックアップします (${autoTs})...`)
  autoBackup(autoTs)

  // 復元
  console.log('\n復元中...')
  for (const { src, dest, name } of plan) {
    copyFileSync(src, dest)
    console.log(`  restored ${name}`)
  }

  console.log(`\n復元完了: ${plan.length} 件`)
  console.log('整合性チェックを実行することをお勧めします:')
  console.log('  npm run validate:data')
}

// ── メイン ────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
使い方:
  npm run restore:data -- --help
      このヘルプを表示

  npm run restore:data -- --list
      利用可能なバックアップ一覧を表示

  npm run restore:data -- --latest
      最新バックアップの復元内容を確認（dry-run）

  npm run restore:data -- --latest --confirm
      最新バックアップを復元（実行前に自動バックアップ）

  npm run restore:data -- --timestamp YYYYMMDD_HHMMSS
      指定タイムスタンプの復元内容を確認（dry-run）

  npm run restore:data -- --timestamp YYYYMMDD_HHMMSS --confirm
      指定タイムスタンプを復元（実行前に自動バックアップ）

注意:
  - --confirm なしは dry-run です。ファイルを変更しません。
  - 復元前に現在の data/ を data/backups/ に自動保存します。
  - .env.local は絶対に対象になりません。
  - 復元後は npm run validate:data で整合性を確認してください。
`.trim())
}

function main(): void {
  if (has('--help') || args.length === 0) {
    printHelp()
    return
  }

  if (has('--list')) {
    const sets = listBackupSets()
    if (sets.length === 0) {
      console.log('バックアップが見つかりません。先に npm run backup:data を実行してください。')
      return
    }
    console.log(`\nバックアップ一覧 (${sets.length} セット)\n`)
    for (const s of sets) {
      console.log(`  ${s.timestamp}  ${s.label}`)
      for (const f of s.files) console.log(`    - ${f}`)
    }
    return
  }

  const confirm   = has('--confirm')
  const useLatest = has('--latest')
  const timestamp = get('--timestamp')

  if (!useLatest && !timestamp) {
    console.error('エラー: --latest または --timestamp YYYYMMDD_HHMMSS を指定してください。')
    console.error('使い方: npm run restore:data -- --help')
    process.exit(1)
  }

  const sets = listBackupSets()
  if (sets.length === 0) {
    console.error('バックアップが見つかりません。先に npm run backup:data を実行してください。')
    process.exit(1)
  }

  let target: BackupSet | undefined
  if (useLatest) {
    target = sets[0]
  } else if (timestamp) {
    target = sets.find(s => s.timestamp === timestamp)
    if (!target) {
      console.error(`エラー: タイムスタンプ "${timestamp}" のバックアップが見つかりません。`)
      console.error('npm run restore:data -- --list で一覧を確認してください。')
      process.exit(1)
    }
  }

  restoreSet(target!, confirm)
}

main()
