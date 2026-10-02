'use client'

import { useState, useTransition } from 'react'
import {
  inviteMemberAction, setMemberActiveAction, setMemberWorkerIdAction,
} from '../actions/admin-members'
import type { MemberRow } from '../lib/repository/admin-members'

export default function AdminMembersPanel({ members }: { members: MemberRow[] }) {
  return (
    <div className="space-y-6">
      <InviteForm />
      <section className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">従業員一覧（{members.length}名）</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {members.map((m) => <MemberRowItem key={m.id} member={m} />)}
        </div>
      </section>
    </div>
  )
}

function InviteForm() {
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [worker, setWorker] = useState('')
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, start]  = useTransition()

  const submit = () => {
    setMsg(null)
    start(async () => {
      const r = await inviteMemberAction(email, name, worker)
      if (r.success) {
        setMsg({ ok: true, text: `${name} さんを招待しました（招待メールを送信）` })
        setEmail(''); setName(''); setWorker('')
      } else {
        setMsg({ ok: false, text: r.error })
      }
    })
  }

  return (
    <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900 mb-1">従業員を招待</h2>
      <p className="text-sm text-slate-600 mb-4">
        メールアドレス宛に招待を送ります。本人がパスワードを設定してログインします。
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">メールアドレス</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            disabled={isPending} placeholder="example@email.com"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">表示名（源氏名）</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            disabled={isPending} placeholder="セラピスト名"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">happ番号（任意）</label>
          <input
            type="number" value={worker} onChange={(e) => setWorker(e.target.value)}
            disabled={isPending} placeholder="50"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>
      <button
        onClick={submit}
        disabled={isPending || !email || !name}
        className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '招待中...' : '招待を送る'}
      </button>
      {msg && (
        <p className={`mt-3 text-sm font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>
          {msg.ok ? '✓ ' : '✗ '}{msg.text}
        </p>
      )}
    </section>
  )
}

function MemberRowItem({ member }: { member: MemberRow }) {
  const [worker, setWorker] = useState(member.happWorkerId != null ? String(member.happWorkerId) : '')
  const [msg, setMsg]       = useState('')
  const [isPending, start]  = useTransition()
  const isAdminRole = member.role === 'admin'

  const toggleActive = () => {
    setMsg('')
    start(async () => {
      const r = await setMemberActiveAction(member.id, !member.active)
      if (!r.success) setMsg(r.error)
    })
  }

  const saveWorker = () => {
    setMsg('')
    start(async () => {
      const r = await setMemberWorkerIdAction(member.id, worker)
      setMsg(r.success ? '保存しました' : r.error)
    })
  }

  return (
    <div className="p-4 md:px-5 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900">{member.displayName}</span>
          {isAdminRole && <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5">管理者</span>}
          {!member.active && <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">停止中</span>}
        </div>
      </div>

      {!isAdminRole && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">happ番号</label>
          <input
            type="number" value={worker} onChange={(e) => setWorker(e.target.value)}
            disabled={isPending} placeholder="未設定"
            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            onClick={saveWorker} disabled={isPending}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      )}

      {!isAdminRole && (
        <button
          onClick={toggleActive} disabled={isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            member.active
              ? 'border border-red-300 text-red-700 hover:bg-red-50'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {member.active ? '停止する' : '再開する'}
        </button>
      )}

      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  )
}
