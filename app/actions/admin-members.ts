'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin } from '../lib/auth-context'
import {
  inviteMember, setMemberActive, setMemberWorkerId, updateMemberName,
} from '../lib/repository/admin-members'

type Result = { success: true } | { success: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseWorkerId(raw: string): number | null {
  const v = raw.trim()
  if (v === '') return null
  const n = parseInt(v, 10)
  return Number.isInteger(n) && n > 0 ? n : NaN as unknown as number
}

export async function inviteMemberAction(
  email: string, displayName: string, workerIdRaw: string,
): Promise<Result> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }

  const mail = email.trim()
  const name = displayName.trim()
  if (!EMAIL_RE.test(mail)) return { success: false, error: 'メールアドレスの形式が正しくありません' }
  if (!name)               return { success: false, error: '表示名を入力してください' }

  const workerId = parseWorkerId(workerIdRaw)
  if (Number.isNaN(workerId)) return { success: false, error: 'happ番号は正の整数で入力してください' }

  const r = await inviteMember(mail, name, workerId)
  if (!r.ok) return { success: false, error: r.error }

  revalidatePath('/admin/members')
  return { success: true }
}

export async function setMemberActiveAction(therapistId: string, active: boolean): Promise<Result> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }
  if (!therapistId) return { success: false, error: '対象が不正です' }
  try {
    await setMemberActive(therapistId, active)
    revalidatePath('/admin/members')
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '失敗しました' }
  }
}

export async function setMemberWorkerIdAction(therapistId: string, workerIdRaw: string): Promise<Result> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }
  if (!therapistId) return { success: false, error: '対象が不正です' }
  const workerId = parseWorkerId(workerIdRaw)
  if (Number.isNaN(workerId)) return { success: false, error: 'happ番号は正の整数で入力してください' }
  try {
    await setMemberWorkerId(therapistId, workerId)
    revalidatePath('/admin/members')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '失敗しました' }
  }
}

export async function updateMemberNameAction(therapistId: string, displayName: string): Promise<Result> {
  if (!(await isAdmin())) return { success: false, error: '権限がありません' }
  const name = displayName.trim()
  if (!therapistId || !name) return { success: false, error: '入力が不正です' }
  try {
    await updateMemberName(therapistId, name)
    revalidatePath('/admin/members')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '失敗しました' }
  }
}
