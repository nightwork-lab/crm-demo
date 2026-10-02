/**
 * 従業員（セラピスト）の管理操作。管理者専用。
 *
 * ⚠️ この層は service_role キー（RLS バイパス・auth 管理API）を使う。
 *    呼び出し元（Server Action）で必ず isAdmin() を確認すること。
 * server side 専用。
 */
import { createSupabaseServerClient } from '../supabase-server'

export type MemberRow = {
  id:           string
  displayName:  string
  role:         'admin' | 'therapist'
  active:       boolean
  happWorkerId: number | null
  createdAt:    string
}

export async function listMembers(): Promise<MemberRow[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('therapists')
    .select('id, display_name, role, active, happ_worker_id, created_at')
    .order('created_at')
  if (error) throw new Error(`therapists: ${error.message}`)
  return (data ?? []).map((t) => ({
    id:           String(t.id),
    displayName:  String(t.display_name),
    role:         t.role as 'admin' | 'therapist',
    active:       Boolean(t.active),
    happWorkerId: t.happ_worker_id ?? null,
    createdAt:    String(t.created_at),
  }))
}

export type InviteResult =
  | { ok: true;  therapistId: string }
  | { ok: false; error: string }

/**
 * メールで従業員を招待し、therapists レコードを作成する。
 * 招待メールから本人がパスワードを設定してログインする。
 */
export async function inviteMember(
  email:        string,
  displayName:  string,
  happWorkerId: number | null,
): Promise<InviteResult> {
  const supabase = createSupabaseServerClient()

  // 既存ユーザーの重複チェック（同一メールの二重招待を防ぐ）
  const redirectTo = process.env.APP_PUBLIC_URL
    ? `${process.env.APP_PUBLIC_URL}/login`
    : undefined

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (error || !data?.user) {
    return { ok: false, error: error?.message ?? '招待に失敗しました' }
  }

  const { error: insErr } = await supabase.from('therapists').insert({
    id:             data.user.id,
    display_name:   displayName,
    role:           'therapist',
    active:         true,
    happ_worker_id: happWorkerId,
  })
  if (insErr) {
    return { ok: false, error: `アカウントは作成されましたが登録に失敗: ${insErr.message}` }
  }
  return { ok: true, therapistId: data.user.id }
}

export async function setMemberActive(therapistId: string, active: boolean): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('therapists')
    .update({ active })
    .eq('id', therapistId)
  if (error) throw new Error(`状態変更: ${error.message}`)
}

export async function setMemberWorkerId(
  therapistId: string,
  happWorkerId: number | null,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('therapists')
    .update({ happ_worker_id: happWorkerId })
    .eq('id', therapistId)
  if (error) throw new Error(`happ対応付け: ${error.message}`)
}

export async function updateMemberName(therapistId: string, displayName: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('therapists')
    .update({ display_name: displayName })
    .eq('id', therapistId)
  if (error) throw new Error(`名前変更: ${error.message}`)
}
