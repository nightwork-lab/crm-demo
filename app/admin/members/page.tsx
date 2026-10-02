import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../lib/auth-context'
import { listMembers } from '../../lib/repository/admin-members'
import { listInviteCodes } from '../../lib/repository/invite-codes'
import AdminMembersPanel from '../../ui/admin-members-panel'
import InviteCodesPanel from '../../ui/invite-codes-panel'

export default async function AdminMembersPage() {
  if (!(await isAdmin())) redirect('/')

  let members
  let codes: Awaited<ReturnType<typeof listInviteCodes>> = []
  try {
    // 別テーブルで依存関係が無いため並列で取る（直列だと1往復ぶん待つ）
    ;[members, codes] = await Promise.all([
      listMembers(),
      listInviteCodes().catch(() => []),
    ])
  } catch {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-slate-700">従業員情報を取得できませんでした（Supabase 未設定の可能性）。</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <header>
        <p className="text-sm text-slate-700">
          管理者 · <Link href="/admin" className="text-blue-700 hover:underline">ダッシュボード</Link>
        </p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">従業員管理</h1>
        <p className="text-sm text-slate-700 mt-1">従業員の招待・停止・happ 対応付けを行います</p>
      </header>

      <InviteCodesPanel
        codes={codes}
        publicUrl={process.env.APP_PUBLIC_URL ?? 'https://custmer-crm.vercel.app'}
      />

      <AdminMembersPanel members={members} />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
        <p><strong>happ番号とは：</strong> happ 上のセラピスト番号です。設定すると自動同期でその従業員のオーダーが取り込まれます。</p>
        <p><strong>停止：</strong> 停止した従業員はログインしてもデータにアクセスできなくなります（アカウントは削除されません）。</p>
      </div>
    </div>
  )
}
