import { resolve } from 'path'

/**
 * JSON データファイルの置き場所を一箇所で解決する。
 *
 * - 既定: `<cwd>/data`（従来どおり）
 * - `DATA_DIR` を設定すると、そのディレクトリを使う（例: `data/demo`）
 *
 * デモ環境（ダミーデータ）を、本番の data/ に触れずに動かすための切替。
 * happ 同期（happ-sync.ts / happ-history.ts）は書き込み先を従来どおり
 * `data/` に固定しているため、この切替の対象外。
 */
export function dataDir(): string {
  return resolve(process.cwd(), process.env.DATA_DIR ?? 'data')
}

export function dataPath(file: string): string {
  return resolve(dataDir(), file)
}
