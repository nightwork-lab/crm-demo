'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { RegistrationCandidate } from '../lib/customer-link'
import { createCustomerAction } from '../actions/create-customer'

type Props = {
  candidate:     RegistrationCandidate
  availableTags: string[]
  isReadonly?:   boolean
}

export default function CreateCustomerDialog({ candidate, availableTags, isReadonly = false }: Props) {
  const [isOpen, setIsOpen]               = useState(false)
  const [name, setName]                   = useState(candidate.customerName)
  const [selectedTags, setSelectedTags]   = useState<Set<string>>(new Set())
  const [extraTagsRaw, setExtraTagsRaw]   = useState('')
  const [memo, setMemo]                   = useState('')
  const [error, setError]                 = useState('')
  const [isPending, startTransition]      = useTransition()
  const router                            = useRouter()

  const open = () => {
    setName(candidate.customerName)
    setSelectedTags(new Set())
    setExtraTagsRaw('')
    setMemo('')
    setError('')
    setIsOpen(true)
  }

  const close = () => {
    if (isPending) return
    setIsOpen(false)
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  // 選択タグ + 手入力タグを統合（重複なし）
  const mergedTags = useMemo(() => {
    const extra = extraTagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    return [...new Set([...selectedTags, ...extra])]
  }, [selectedTags, extraTagsRaw])

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('顧客名は必須です')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await createCustomerAction({
        name,
        memo,
        tags: mergedTags.join(', '),
        happCustomerId: candidate.happCustomerId,
      })
      if (result.success) {
        close()
        router.push(`/customers/${result.crmCustomerId}`)
      } else {
        setError(result.error)
      }
    })
  }

  // happCustomerId が 0 は ID 不明のため登録不可
  if (candidate.happCustomerId === 0) {
    return (
      <span className="text-xs text-slate-700">ID不明・手動登録</span>
    )
  }

  if (isReadonly) {
    return (
      <span className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs text-slate-400 cursor-not-allowed">
        閲覧専用
      </span>
    )
  }

  return (
    <>
      <button
        onClick={open}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors"
      >
        新規顧客として登録
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* オーバーレイ */}
          <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />

          {/* フォーム */}
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 sm:mx-4 max-h-[90dvh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">新規顧客として登録</h3>
                <p className="text-sm text-slate-700 mt-0.5">happ ID: {candidate.happCustomerId}</p>
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

            {/* happ 候補情報 */}
            <div className="rounded-xl bg-green-50 border border-green-100 p-4 mb-5">
              <p className="text-sm font-semibold text-slate-700">登録元（happ-s.com）</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{candidate.customerName}</p>
              <div className="mt-1.5 flex gap-4 text-sm text-slate-700">
                <span>{candidate.orderCount}件のオーダー</span>
                <span>¥{candidate.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* 入力フォーム */}
            <div className="space-y-4">
              {/* 顧客名 */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  顧客名 <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  placeholder="例: るん様"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
                />
              </div>

              {/* タグ */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  タグ（任意）
                </label>

                {/* 既存タグから選択 */}
                {availableTags.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      既存タグから選択
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          disabled={isPending}
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                            selectedTags.has(tag)
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 手入力 */}
                <input
                  type="text"
                  value={extraTagsRaw}
                  onChange={(e) => setExtraTagsRaw(e.target.value)}
                  disabled={isPending}
                  placeholder="新しいタグをカンマ区切りで入力"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
                />

                {/* 登録されるタグのプレビュー */}
                {mergedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {mergedTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* メモ */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  メモ（任意）
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  disabled={isPending}
                  rows={3}
                  placeholder="特記事項・連絡メモなど"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 resize-none"
                />
              </div>

              {/* エラー */}
              {error && (
                <p className="text-sm font-semibold text-red-700">{error}</p>
              )}

              {/* ボタン */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? '登録中...' : '登録して紐付ける'}
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
        </div>
      )}
    </>
  )
}
