/**
 * DATA_SOURCE 環境変数でデータ読み取り元を切り替える。
 * 未設定または 'json' → JSON ファイル読み取り
 * 'supabase' → Supabase 読み取り
 * server side のみ。
 */
export function getDataSource(): 'json' | 'supabase' {
  return process.env.DATA_SOURCE === 'supabase' ? 'supabase' : 'json'
}
