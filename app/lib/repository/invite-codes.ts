/**
 * 招待コードの発行・検証・使用。
 *
 * 従業員セルフ登録の仕組み:
 *   管理者がコードを発行 → 従業員がコード＋メール＋パスワードで登録
 *   → therapists レコードが自動作成される（happ番号は発行時に紐付け済み）
 *
 * ⚠️ service_role を使う。呼び出し元で権限を確認すること
 *    （発行系は isAdmin() 必須。登録系はコード検証が権限の代わり）
 * server side 専用。
 */
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '../supabase-server'

export type InviteCode = {
  code:         string
  displayName:  string
  happWorkerId: number | null
  createdAt:    string
  expiresAt:    string
  usedAt:       string | null
  status:       'active' | 'used' | 'expired'
}

const CODE_TTL_DAYS = 14

/** 紛らわしい文字（0/O, 1/I/L）を除いた読み間違えにくいコードを生成する。 */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length]
    if (i === 3) out += '-'   // XXXX-XXXX 形式で読みやすく
  }
  return out
}

function toStatus(row: { expires_at: string; used_at: string | null }): InviteCode['status'] {
  if (row.used_at) return 'used'
  return new Date(row.expires_at) < new Date() ? 'expired' : 'active'
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('invite_codes')
    .select('code, display_name, happ_worker_id, created_at, expires_at, used_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(`invite_codes: ${error.message}`)
  return (data ?? []).map((r) => ({
    code:         String(r.code),
    displayName:  String(r.display_name),
    happWorkerId: r.happ_worker_id ?? null,
    createdAt:    String(r.created_at),
    expiresAt:    String(r.expires_at),
    usedAt:       r.used_at ?? null,
    status:       toStatus(r as { expires_at: string; used_at: string | null }),
  }))
}

/** 招待コードを発行する（管理者専用）。 */
export async function createInviteCode(
  displayName:  string,
  happWorkerId: number | null,
  createdBy:    string,
): Promise<string> {
  const supabase = createSupabaseServerClient()
  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('invite_codes').insert({
    code,
    display_name:   displayName,
    happ_worker_id: happWorkerId,
    created_by:     createdBy,
    expires_at:     expiresAt,
  })
  if (error) throw new Error(`招待コード発行: ${error.message}`)
  return code
}

export type BulkIssueTarget = { displayName: string; happWorkerId: number }
export type BulkIssueResult = { displayName: string; happWorkerId: number; code: string }

/**
 * 複数人分の招待コードをまとめて発行する（管理者専用）。
 * 既に登録済み・有効なコードを発行済みの人は対象から除外して返す。
 */
export async function createInviteCodesBulk(
  targets:   BulkIssueTarget[],
  createdBy: string,
): Promise<{ issued: BulkIssueResult[]; skipped: BulkIssueTarget[] }> {
  const supabase = createSupabaseServerClient()

  // 既に登録済みのセラピスト（happ番号で判定）
  const { data: existing } = await supabase
    .from('therapists').select('happ_worker_id').not('happ_worker_id', 'is', null)
  const registered = new Set((existing ?? []).map((r) => r.happ_worker_id as number))

  // 未使用かつ有効なコードが既にある人
  const { data: activeCodes } = await supabase
    .from('invite_codes').select('happ_worker_id, expires_at, used_at').is('used_at', null)
  const pending = new Set(
    (activeCodes ?? [])
      .filter((c) => new Date(c.expires_at as string) > new Date())
      .map((c) => c.happ_worker_id as number),
  )

  const issued: BulkIssueResult[] = []
  const skipped: BulkIssueTarget[] = []
  const rows: object[] = []
  const expiresAt = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  for (const t of targets) {
    if (registered.has(t.happWorkerId) || pending.has(t.happWorkerId)) {
      skipped.push(t)
      continue
    }
    const code = generateCode()
    issued.push({ ...t, code })
    rows.push({
      code,
      display_name:   t.displayName,
      happ_worker_id: t.happWorkerId,
      created_by:     createdBy,
      expires_at:     expiresAt,
    })
  }

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('invite_codes').insert(rows.slice(i, i + 100))
    if (error) throw new Error(`一括発行: ${error.message}`)
  }

  return { issued, skipped }
}

export async function revokeInviteCode(code: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('invite_codes').delete().eq('code', code).is('used_at', null)
  if (error) throw new Error(`招待コード削除: ${error.message}`)
}

// ---------- 登録処理（コード検証 → アカウント作成） ----------

export type RedeemResult =
  | { ok: true;  displayName: string }
  | { ok: false; error: string }

/**
 * 招待コードを使ってアカウントを作成する。
 * コードの有効性がそのまま権限チェックになる（未ログインから呼ばれる）。
 */
export async function redeemInviteCode(
  code:     string,
  email:    string,
  password: string,
): Promise<RedeemResult> {
  const supabase = createSupabaseServerClient()
  const normalized = code.trim().toUpperCase()

  // 1. コード検証
  const { data: invite } = await supabase
    .from('invite_codes')
    .select('code, display_name, happ_worker_id, expires_at, used_at')
    .eq('code', normalized)
    .maybeSingle()

  if (!invite)                              return { ok: false, error: '招待コードが見つかりません' }
  if (invite.used_at)                       return { ok: false, error: 'この招待コードは既に使用されています' }
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: '招待コードの有効期限が切れています' }

  // 2. Auth ユーザー作成（メール確認は不要・すぐログインできる）
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !created?.user) {
    const msg = authErr?.message ?? 'アカウント作成に失敗しました'
    return { ok: false, error: /already/i.test(msg) ? 'このメールアドレスは既に登録されています' : msg }
  }

  // 3. therapists レコード作成
  const { error: insErr } = await supabase.from('therapists').insert({
    id:             created.user.id,
    display_name:   invite.display_name,
    role:           'therapist',
    active:         true,
    happ_worker_id: invite.happ_worker_id,
  })
  if (insErr) {
    // 整合性を保つため、作成した Auth ユーザーを取り消す
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => {})
    return { ok: false, error: `登録に失敗しました: ${insErr.message}` }
  }

  // 4. コードを使用済みにする
  await supabase.from('invite_codes')
    .update({ used_at: new Date().toISOString(), used_by: created.user.id })
    .eq('code', normalized)

  return { ok: true, displayName: String(invite.display_name) }
}
