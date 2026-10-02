'use client'

import { createContext, useContext } from 'react'

export type BatchItem = {
  customerId:       string
  targetMonth:      string
  predictedVisits:  number
  predictedRevenue: number
  memo:             string
}

type BatchCtx = {
  /** 行が現在の入力値を親へ報告する。item=null で「変更なし」に戻す。 */
  report:  (customerId: string, item: BatchItem | null) => void
  enabled: boolean
}

export const PredictionBatchContext = createContext<BatchCtx>({
  report:  () => {},
  enabled: false,
})

export const usePredictionBatch = () => useContext(PredictionBatchContext)
