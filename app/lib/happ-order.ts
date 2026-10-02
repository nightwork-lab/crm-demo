/**
 * happ-s.com から取得するオーダーの型定義。
 * DB移行時はこの型をそのままテーブルスキーマのベースにできる。
 */
export type HappOrder = {
  orderId: number              // happ-s.com 上の注文ID（主キー）
  customerId: number           // happ-s.com 上の顧客ID
  customerName: string         // お客様名（「様」を除いた表記）
  startTime: string            // 開始時間 "YYYY/MM/DD HH:mm"
  endTime: string              // 終了時間 "YYYY/MM/DD HH:mm"（空文字の場合あり）
  course: string               // コース名
  area?: string                // 利用エリア（happ の【利用エリア】。同期前の既存データには無い）
  paymentMethod: string        // 支払い方法
  status: string               // 表示ステータス（未確定 / 確定 / 完了 / キャンセル 等）
  internalStatus: string       // 内部ステータス（modal の【ステータス】値）
  totalAmount: number          // 合計金額（円）
  therapistFee: number         // ギャラ（円）
  source: 'orderList' | 'orderListCash' | 'uriageTherapist'  // 取得元ページ
  syncedAt: string             // この行を最後に同期した日時 ISO8601
}

export type HappOrdersFile = {
  lastSyncedAt: string         // 最終同期日時 ISO8601
  orders: HappOrder[]
}
