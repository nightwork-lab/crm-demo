import { hasGoogleCredentials } from './google-calendar'

/**
 * アプリの動作モード判定。
 * APP_READONLY=true の場合は閲覧専用モード（Vercel公開時を想定）。
 * Server Component / Server Action でのみ呼び出し可能。
 */

export const READONLY_MESSAGE =
  '閲覧専用モードのため、この操作はローカル環境で実行してください'

export const SYNC_READONLY_MESSAGE =
  'Vercel公開環境では happ 同期は実行できません。Macのローカル環境で行ってください。'

/** APP_READONLY=true なら閲覧専用モード */
export function isReadonlyMode(): boolean {
  return process.env.APP_READONLY === 'true'
}

/**
 * Supabase 書き込み対応済みのアクション用の判定。
 * DATA_SOURCE=supabase なら書き込み先は Supabase（セラピスト別・RLS 適用）のため、
 * 閲覧専用モードでも保存を許可する。JSON 書き込みのアクションはこれを使わないこと。
 */
export function isWriteBlocked(): boolean {
  if (process.env.DATA_SOURCE === 'supabase') return false
  return isReadonlyMode()
}

/** Vercel 上で動作しているか（VERCEL=1 は Vercel が自動設定） */
export function isVercelEnvironment(): boolean {
  return process.env.VERCEL === '1'
}

export const CALENDAR_DISABLED_MESSAGE =
  'この環境ではカレンダー同期が無効です。Google の認証情報（GOOGLE_SA_KEY_JSON）と ' +
  'カレンダーIDを環境変数に設定してください。'

/**
 * Google カレンダー連携を実行してよいか。
 *
 * この処理はアプリのデータ（JSON / Supabase）を一切変更せず、外部サービスにだけ
 * 書き込む。そのため APP_READONLY（＝自前データの保護）の対象外とする。
 *
 * 本番では「資格情報が設定されていること」自体を意思表示とみなして有効になる。
 * 環境変数を増やさずに済ませるための判断。止めたいときだけ
 * CALENDAR_SYNC_ENABLED=false を設定すれば、鍵を消さずに無効化できる。
 *
 * 「誰が使えるか」はこの関数ではなく、各アクション先頭の hasDevAccess() が決める。
 */
export function isCalendarSyncEnabled(): boolean {
  // 明示的な停止スイッチ（環境を問わず優先）
  if (process.env.CALENDAR_SYNC_ENABLED === 'false') return false
  // ローカル（閲覧専用モードでない）は従来どおり無条件で利用可
  if (!isReadonlyMode()) return true
  // 本番は資格情報が入っていれば有効
  return hasGoogleCredentials()
}
