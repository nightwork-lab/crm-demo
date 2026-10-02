'use client'

import { useState, useTransition } from 'react'
import type { Customer } from '../lib/data'
import { updateCustomerAction } from '../actions/update-customer'

type Props = { customer: Customer; isReadonly?: boolean }

export default function EditCustomerDialog({ customer, isReadonly = false }: Props) {
  const [isOpen, setIsOpen]       = useState(false)
  const [name, setName]           = useState(customer.name)
  const [tagsRaw, setTagsRaw]     = useState((customer.tags ?? []).join(', '))
  const [memo, setMemo]           = useState(customer.memo)
  const [birthday, setBirthday]   = useState(customer.birthday ?? '')
  const [error, setError]         = useState('')
  const [isPending, startTransition] = useTransition()

  const open = () => {
    setName(customer.name)
    setTagsRaw((customer.tags ?? []).join(', '))
    setMemo(customer.memo)
    setBirthday(customer.birthday ?? '')
    setError('')
    setIsOpen(true)
  }
  const close = () => { setIsOpen(false); setError('') }

  const handleSave = () => {
    setError('')
    startTransition(async () => {
      const result = await updateCustomerAction(customer.id, name, tagsRaw, memo, birthday || undefined)
      if (result.success) {
        close()
      } else {
        setError(result.error)
      }
    })
  }

  if (isReadonly) {
    return (
      <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-400 cursor-not-allowed">
        閲覧専用モード
      </span>
    )
  }

  return (
    <>
      <button
        onClick={open}
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
      >
        顧客情報を編集
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 sm:mx-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">顧客情報を編集</h3>
                <p className="text-sm text-slate-700 mt-0.5">ID: {customer.id}</p>
              </div>
              <button
                onClick={close}
                disabled={isPending}
                className="text-slate-500 hover:text-slate-700 p-1 -mr-1 -mt-1"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* 顧客名 */}
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  顧客名 <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError('') }}
                  disabled={isPending}
                  placeholder="顧客名"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                />
              </div>

              {/* タグ */}
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  タグ（カンマ区切り）
                </label>
                <input
                  type="text"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  disabled={isPending}
                  placeholder="例: 常連, 月1, 要フォロー"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                />
                {tagsRaw && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tagsRaw.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 誕生日 */}
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  誕生日（任意）
                </label>
                <input
                  type="text"
                  value={birthday}
                  onChange={(e) => { setBirthday(e.target.value); setError('') }}
                  disabled={isPending}
                  placeholder="例: 03-15 または 1990-03-15"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-slate-500">年が不明な場合は MM-DD 形式（例: 03-15）</p>
              </div>

              {/* メモ */}
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  メモ
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  disabled={isPending}
                  placeholder="顧客に関するメモ"
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 resize-y"
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? '保存中...' : '保存する'}
              </button>
              <button
                onClick={close}
                disabled={isPending}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
