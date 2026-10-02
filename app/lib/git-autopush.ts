/**
 * 同期後にデータファイルを自動コミット・プッシュするユーティリティ。
 * server side 専用。ローカル環境（非 readonly）でのみ呼ばれる想定。
 *
 * data/*.json を add → commit → push する。
 * 変更がなければ何もしない。失敗してもデータ保存自体は成功しているため、
 * 例外を投げずに結果オブジェクトで返す。
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export type AutoPushResult =
  | { pushed: true;  message: string }
  | { pushed: false; reason: string }

const DATA_FILES = [
  'data/customers.json',
  'data/happ-orders.json',
  'data/customer-links.json',
]

export async function autoCommitAndPush(label: string): Promise<AutoPushResult> {
  const cwd = process.cwd()
  const run = (args: string[]) => exec('git', args, { cwd })

  try {
    // 変更があるか確認
    const { stdout: status } = await run(['status', '--porcelain', ...DATA_FILES])
    if (!status.trim()) {
      return { pushed: false, reason: '変更なし（コミット不要）' }
    }

    await run(['add', ...DATA_FILES])

    const timestamp = new Date().toLocaleString('ja-JP')
    await run(['commit', '-m', `chore: auto-sync data after ${label} (${timestamp})`])

    await run(['push', 'origin', 'HEAD'])

    return { pushed: true, message: `本番へ反映しました（${label}）` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { pushed: false, reason: `git 操作に失敗: ${msg}` }
  }
}
