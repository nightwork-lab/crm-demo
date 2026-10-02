'use client'

import { useState, useTransition } from 'react'
import type { CustomerPrediction, CustomerPredictionContext } from '../lib/prediction'
import { formatMonthLabel } from '../lib/prediction-utils'
import { upsertPredictionAction } from '../actions/upsert-prediction'

type Props = {
  customerId:  string
  targetMonth: string
  prediction:  CustomerPrediction | null
  context:     CustomerPredictionContext
  isReadonly?: boolean
}

export default function PredictionForm({ customerId, targetMonth, prediction, context, isReadonly = false }: Props) {
  const [isEditing, setIsEditing]         = useState(!prediction)
  const [visits, setVisits]               = useState(String(prediction?.predictedVisits ?? ''))
  const [revenue, setRevenue]             = useState(String(prediction?.predictedRevenue ?? ''))
  const [memo, setMemo]                   = useState(prediction?.memo ?? '')
  const [error, setError]                 = useState('')
  const [isPending, startTransition]      = useTransition()

  const handleSave = () => {
    const v = parseFloat(visits)
    const r = parseFloat(revenue)
    if (!Number.isFinite(v) || v < 0) { setError('来店回数を正しく入力してください'); return }
    if (!Number.isFinite(r) || r < 0) { setError('予測売上を正しく入力してください'); return }
    setError('')
    startTransition(async () => {
      const result = await upsertPredictionAction(customerId, targetMonth, v, r, memo)
      if (result.success) {
        setIsEditing(false)
      } else {
        setError(result.error)
      }
    })
  }

  const handleEdit = () => {
    setVisits(String(prediction?.predictedVisits ?? ''))
    setRevenue(String(prediction?.predictedRevenue ?? ''))
    setMemo(prediction?.memo ?? '')
    setError('')
    setIsEditing(true)
  }

  return (
    <div className="space-y-5">
      {/* 参考情報 */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          予測の参考情報
        </p>

        {/* 先月実績（目立つ） */}
        <div className="rounded-xl bg-white border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">先月実績</p>
          {context.lastMonth.visitCount === 0 && context.lastMonth.amount === 0 ? (
            <p className="text-sm text-slate-500">先月の実績データがありません</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500">来店回数</p>
                <p className="text-xl font-bold text-slate-900">
                  {context.lastMonth.visitCount}
                  <span className="text-sm font-normal text-slate-600 ml-1">回</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">売上</p>
                <p className="text-xl font-bold text-slate-900">
                  ¥{context.lastMonth.amount.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* その他参考 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">3ヶ月平均来店</p>
            <p className="font-semibold text-slate-900">{context.avg3months.visitCount}回</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">3ヶ月平均売上</p>
            <p className="font-semibold text-slate-900">¥{context.avg3months.amount.toLocaleString()}</p>
          </div>
          {context.avgVisitInterval != null && (
            <div>
              <p className="text-xs text-slate-500">来店周期</p>
              <p className="font-semibold text-slate-900">約{context.avgVisitInterval}日</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500">最終来店</p>
            <p className="font-semibold text-slate-900">{context.lastVisitDate ?? '—'}</p>
          </div>
          {context.nextReservation && (
            <div>
              <p className="text-xs text-slate-500">次回予約</p>
              <p className="font-semibold text-green-700">{context.nextReservation}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500">累計売上</p>
            <p className="font-semibold text-slate-900">¥{context.totalAmount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 予測表示 or 入力フォーム */}
      {!isEditing && prediction ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs text-slate-500">予測来店回数</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">
                {prediction.predictedVisits}
                <span className="text-sm font-normal text-slate-600 ml-1">回</span>
              </p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs text-slate-500">予測売上</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">
                ¥{prediction.predictedRevenue.toLocaleString()}
              </p>
            </div>
            {prediction.memo && (
              <div className="rounded-xl bg-white border border-slate-200 p-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-slate-500">メモ</p>
                <p className="text-sm text-slate-900 mt-0.5 whitespace-pre-wrap">{prediction.memo}</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>更新: {new Date(prediction.updatedAt).toLocaleString('ja-JP')}</span>
            <button
              onClick={handleEdit}
              className="text-blue-700 hover:underline font-medium"
            >
              編集
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700">
            {formatMonthLabel(targetMonth)} の予測を入力
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                予測来店回数
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={visits}
                onChange={(e) => { setVisits(e.target.value); setError('') }}
                disabled={isPending}
                placeholder="例: 2"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                予測売上（円）
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={revenue}
                onChange={(e) => { setRevenue(e.target.value); setError('') }}
                disabled={isPending}
                placeholder="例: 30000"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              メモ（任意）
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={isPending}
              rows={2}
              placeholder="特記事項があれば..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm font-semibold text-red-700">{error}</p>
          )}

          {isReadonly && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              閲覧専用モードのため保存できません
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isReadonly || isPending || !visits || !revenue}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? '保存中...' : '保存する'}
            </button>
            {prediction && (
              <button
                onClick={() => setIsEditing(false)}
                disabled={isPending}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
