'use client'

import { useState, useTransition } from 'react'
import type { Customer } from '../lib/data'
import type { RegistrationCandidate } from '../lib/customer-link'
import {
  linkCustomerAction,
  unlinkCustomerAction,
} from '../actions/link-customer'

/** 同名顧客を区別するための表示用メタ情報（最終来店・来店回数・次回予約） */
export type CustomerLinkMeta = {
  lastVisit:       string | null
  visitCount:      number
  nextReservation: string | null
}

type Props = {
  candidate:    RegistrationCandidate
  customers:    Customer[]
  customerMeta?: Record<string, CustomerLinkMeta>
  isReadonly?:  boolean
}

/** 「最終来店 2026/08/12・12回」形式のメタ表示文字列を作る */
function metaLabel(meta: CustomerLinkMeta | undefined): string {
  if (!meta) return ''
  const last = meta.lastVisit ? meta.lastVisit.slice(0, 10) : '来店記録なし'
  return `最終来店 ${last}・${meta.visitCount}回`
}

export default function LinkCustomerDialog({ candidate, customers, customerMeta, isReadonly = false }: Props) {
  const [isOpen, setIsOpen]         = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [error, setError]           = useState('')
  const [isPending, startTransition] = useTransition()

  // 名前順に並べる（同名顧客が隣接して比較しやすいように）
  const sortedCustomers = [...customers].sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // 名前一致の候補（UI ヒントのみ。自動紐付けには使わない）。同名複数に対応して全件出す
  const nameSuggestions = customers.filter((c) => c.name === candidate.customerName)

  const open  = () => {
    // 名前一致があっても自動選択しない（同名別人防止）
    setIsOpen(true)
    setSelectedId('')
    setError('')
  }
  const close = () => { setIsOpen(false); setSelectedId(''); setError('') }

  const handleLink = () => {
    if (!selectedId) {
      setError('顧客を選択してください')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await linkCustomerAction(
        candidate.happCustomerId,
        selectedId,
        candidate.customerName,
      )
      if (result.success) {
        close()
      } else {
        setError(result.error)
      }
    })
  }

  // happCustomerId が 0 の場合はID紐付け不可（名寄せ辞書を使う案内のみ）
  if (candidate.happCustomerId === 0) {
    return (
      <span className="text-xs text-slate-700">
        名寄せ辞書で登録
      </span>
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
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        既存顧客に紐付け
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />

          {/* ダイアログ本体 */}
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 sm:mx-4">
            {/* ヘッダー */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">既存顧客に紐付け</h3>
                <p className="text-sm text-slate-700 mt-0.5">
                  happ ID: {candidate.happCustomerId}
                </p>
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

            {/* 候補情報 */}
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 mb-4">
              <p className="text-sm font-semibold text-slate-700">紐付け対象</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{candidate.customerName}</p>
              <div className="mt-1.5 flex gap-4 text-sm text-slate-700">
                <span>{candidate.orderCount}件のオーダー</span>
                <span>¥{candidate.totalAmount.toLocaleString()}</span>
                <span>最終: {candidate.latestStartTime.slice(0, 10)}</span>
              </div>
            </div>

            {/* 名前一致ヒント（自動選択はしない）。同名複数はメタ情報で見分ける */}
            {nameSuggestions.length > 0 && (
              <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 mb-4">
                <p className="text-xs font-semibold text-yellow-800 mb-1">
                  名前一致候補（要確認・{nameSuggestions.length}件）
                </p>
                <p className="text-xs text-yellow-700 mb-2">
                  ※ 同名別人の場合があります。最終来店日・回数で確認してから選択してください
                </p>
                <div className="space-y-1.5">
                  {nameSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedId(s.id); setError('') }}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        selectedId === s.id
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-yellow-200 bg-white hover:bg-yellow-100'
                      }`}
                    >
                      <span className="text-sm font-bold text-slate-900">{s.name}</span>
                      <span className="block text-xs text-slate-600 mt-0.5">
                        {metaLabel(customerMeta?.[s.id]) || '来店記録なし'}
                        {customerMeta?.[s.id]?.nextReservation && (
                          <span className="text-green-700 ml-2">
                            次回予約 {customerMeta[s.id].nextReservation}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 顧客選択 */}
            <div className="mb-4">
              <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
                紐付ける CRM 顧客
              </label>
              <select
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setError('') }}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              >
                <option value="">-- 顧客を選択してください --</option>
                {sortedCustomers.map((c) => {
                  const m = metaLabel(customerMeta?.[c.id])
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}{m ? `｜${m}` : ''}
                    </option>
                  )
                })}
              </select>
              {selectedId && customerMeta?.[selectedId] && (
                <p className="mt-1.5 text-xs text-slate-600">
                  選択中: {metaLabel(customerMeta[selectedId])}
                  {customerMeta[selectedId].nextReservation && (
                    <span className="text-green-700 ml-2">
                      次回予約 {customerMeta[selectedId].nextReservation}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* エラー */}
            {error && (
              <p className="text-sm font-semibold text-red-700 mb-3">{error}</p>
            )}

            {/* ボタン */}
            <div className="flex gap-3">
              <button
                onClick={handleLink}
                disabled={isPending}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? '保存中...' : '紐付ける'}
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

// ---------- 紐付け解除ボタン（来店履歴候補行で使う）----------

type UnlinkProps = {
  happCustomerId: number
  customerName: string
}

export function UnlinkButton({ happCustomerId, customerName }: UnlinkProps) {
  const [isPending, startTransition] = useTransition()
  const [confirmed, setConfirmed]    = useState(false)

  const handleUnlink = () => {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    startTransition(async () => {
      await unlinkCustomerAction(happCustomerId)
      setConfirmed(false)
    })
  }

  return (
    <button
      onClick={handleUnlink}
      disabled={isPending}
      className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-50 ${
        confirmed
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'text-slate-500 hover:text-red-600 hover:bg-red-50'
      }`}
      title={`${customerName} の紐付けを解除`}
    >
      {isPending ? '解除中...' : confirmed ? '本当に解除？' : '解除'}
    </button>
  )
}
