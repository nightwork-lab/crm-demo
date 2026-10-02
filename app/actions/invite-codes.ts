'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin, getCurrentTherapistId } from '../lib/auth-context'
import {
  createInviteCode, createInviteCodesBulk, revokeInviteCode, redeemInviteCode,
  type BulkIssueResult, type BulkIssueTarget,
} from '../lib/repository/invite-codes'

type Result = { success: true } | { success: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 招待コードを発行する（管理者専用）。 */
export async function createInviteCodeAction(
  displayName: string,
  workerIdRaw: string,
): Promise<{ success: true; code: string } | { success: false; error: string }> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }

  const name = displayName.trim()
  if (!name) return { success: false, error: '表示名を入力してください' }

  let workerId: number | null = null
  const raw = workerIdRaw.trim()
  if (raw !== '') {
    const n = parseInt(raw, 10)
    if (!Number.isInteger(n) || n <= 0) return { success: false, error: 'happ番号は正の整数で入力してください' }
    workerId = n
  }

  try {
    const adminId = await getCurrentTherapistId()
    const code = await createInviteCode(name, workerId, adminId!)
    revalidatePath('/admin/members')
    return { success: true, code }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '発行に失敗しました' }
  }
}

/**
 * 複数人分の招待コードを一括発行する（管理者専用）。
 * 入力は happ のセラピスト一覧を貼り付けた文字列。
 * 「名前(年齢)番号」形式の行から表示名と happ 番号を抽出する。
 */
export async function createInviteCodesBulkAction(
  rawList: string,
): Promise<
  | { success: true; issued: BulkIssueResult[]; skipped: BulkIssueTarget[]; publicUrl: string }
  | { success: false; error: string }
> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }

  // 「まさき(28)168」形式を抽出。番号は happ の worker_id ではなく表示上の番号のため、
  // 「名前 タブ/カンマ 番号」形式も受け付ける
  const targets: BulkIssueTarget[] = []
  const seen = new Set<number>()
  for (const line of rawList.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    // 形式A: "名前<区切り>番号"（タブ・カンマ・全角スペース）
    const m = s.match(/^(.+?)[\t,、，\s]+(\d+)\s*$/)
    if (!m) continue
    const name = m[1].trim().replace(/\(\d+\)\d*$/, '').trim()
    const id   = parseInt(m[2], 10)
    if (!name || !Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    targets.push({ displayName: name, happWorkerId: id })
  }

  if (targets.length === 0) {
    return { success: false, error: '有効な行が見つかりません（「名前 番号」の形式で1行ずつ入力してください）' }
  }

  try {
    const adminId = await getCurrentTherapistId()
    const { issued, skipped } = await createInviteCodesBulk(targets, adminId!)
    revalidatePath('/admin/members')
    return {
      success: true, issued, skipped,
      publicUrl: process.env.APP_PUBLIC_URL ?? 'https://custmer-crm.vercel.app',
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '一括発行に失敗しました' }
  }
}

export async function revokeInviteCodeAction(code: string): Promise<Result> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }
  if (!code) return { success: false, error: 'コードが不正です' }
  try {
    await revokeInviteCode(code)
    revalidatePath('/admin/members')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '削除に失敗しました' }
  }
}

/**
 * 招待コードでアカウントを登録する（未ログインから呼ばれる）。
 * 権限チェックの代わりにコードの有効性を検証する。
 */
export async function signupWithInviteAction(
  code: string,
  email: string,
  password: string,
): Promise<{ success: true; displayName: string } | { success: false; error: string }> {
  const c = code.trim()
  const m = email.trim()

  if (!c)                  return { success: false, error: '招待コードを入力してください' }
  if (!EMAIL_RE.test(m))   return { success: false, error: 'メールアドレスの形式が正しくありません' }
  if (password.length < 8) return { success: false, error: 'パスワードは8文字以上で設定してください' }

  const r = await redeemInviteCode(c, m, password)
  if (!r.ok) return { success: false, error: r.error }
  return { success: true, displayName: r.displayName }
}
