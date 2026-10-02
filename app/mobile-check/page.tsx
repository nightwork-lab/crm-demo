'use client'

/**
 * PWA / スマホ動作確認ページ
 * 顧客情報・売上データは一切表示しない。
 * URL直打ちで確認: http://localhost:3000/mobile-check
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type EnvInfo = {
  screenW:        number
  screenH:        number
  viewportW:      number
  viewportH:      number
  dpr:            number
  standalone:     boolean
  hasTouch:       boolean
  platform:       string
  safeTop:        string
  safeBottom:     string
  safeLeft:       string
  safeRight:      string
}

const MAIN_PAGES = [
  { href: '/',              label: 'ダッシュボード', check: '各KPI数値が見えるか・下部ナビが被らないか' },
  { href: '/customers',     label: '顧客一覧',       check: '検索・ソート・タグフィルターが使えるか' },
  { href: '/orders',        label: '外部オーダー',   check: '月別アコーディオンが開閉できるか' },
  { href: '/predictions',   label: '来店予測',       check: '月切り替えボタンが押しやすいか' },
  { href: '/alerts',        label: '来店アラート',   check: 'カード一覧が見やすいか' },
  { href: '/anniversaries', label: '記念日',         check: '日付・ラベルが読みやすいか' },
  { href: '/settings',      label: '設定',           check: 'ページが正常に開くか' },
  { href: '/sync',          label: '同期',           check: '同期ボタンが押しやすいか' },
]

const CHECK_ITEMS = [
  '横スクロールが発生していない',
  '下部ナビがホームインジケータに被っていない',
  'ボタンの高さが十分（最低44px相当）',
  'テキストが小さすぎない（本文14px以上）',
  'モーダルが画面内に収まっている',
  'フォーム入力欄が使いやすい',
  '月切り替えナビが1行または2行で見やすい',
  'アコーディオンの開閉がスムーズ',
]

export default function MobileCheckPage() {
  const [info, setInfo]       = useState<EnvInfo | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const safeRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const getSafeValue = (side: 'top' | 'bottom' | 'left' | 'right') => {
      if (!safeRef.current) return '取得中...'
      const style = window.getComputedStyle(safeRef.current)
      const map = { top: 'paddingTop', bottom: 'paddingBottom', left: 'paddingLeft', right: 'paddingRight' }
      return style[map[side] as keyof CSSStyleDeclaration] as string
    }

    const ua = navigator.userAgent
    let platform = 'unknown'
    if (/iPhone/.test(ua))  platform = 'iPhone'
    else if (/iPad/.test(ua))   platform = 'iPad'
    else if (/Android/.test(ua)) platform = 'Android'
    else if (/Mac/.test(ua))     platform = 'macOS'
    else if (/Win/.test(ua))     platform = 'Windows'

    setInfo({
      screenW:    screen.width,
      screenH:    screen.height,
      viewportW:  window.innerWidth,
      viewportH:  window.innerHeight,
      dpr:        window.devicePixelRatio,
      standalone: window.matchMedia('(display-mode: standalone)').matches ||
                  ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true),
      hasTouch:   navigator.maxTouchPoints > 0,
      platform,
      safeTop:    getSafeValue('top'),
      safeBottom: getSafeValue('bottom'),
      safeLeft:   getSafeValue('left'),
      safeRight:  getSafeValue('right'),
    })
  }, [])

  const toggleCheck = (item: string) =>
    setChecked(prev => ({ ...prev, [item]: !prev[item] }))

  const checkedCount = Object.values(checked).filter(Boolean).length

  return (
    <div className="min-h-screen bg-slate-100 pb-8">
      {/* セーフエリア計測用の不可視要素（画面外には表示しない） */}
      <div
        ref={safeRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: 1, height: 1,
          opacity: 0,
          pointerEvents: 'none',
          paddingTop:    'env(safe-area-inset-top,    0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft:   'env(safe-area-inset-left,   0px)',
          paddingRight:  'env(safe-area-inset-right,  0px)',
        }}
      />

      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {/* ヘッダー */}
        <header className="pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">診断</p>
          <h1 className="text-2xl font-bold mt-1 text-slate-900">PWA / スマホ 動作確認</h1>
          <p className="text-sm text-slate-600 mt-1">
            このページは顧客情報を表示しません。スマホ実機確認用のページです。
          </p>
        </header>

        {/* 1. 環境情報 */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">環境情報</h2>
          {!info ? (
            <p className="text-sm text-slate-500">取得中...</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <InfoRow label="端末"       value={info.platform} />
              <InfoRow label="タッチ対応" value={info.hasTouch ? '✅ あり' : '❌ なし'} />
              <InfoRow label="画面サイズ" value={`${info.screenW} × ${info.screenH}px`} />
              <InfoRow label="viewport"   value={`${info.viewportW} × ${info.viewportH}px`} />
              <InfoRow label="DPR"        value={`${info.dpr}x`} />
              <InfoRow
                label="起動モード"
                value={info.standalone ? '✅ standalone（PWA）' : '🌐 ブラウザ'}
                highlight={info.standalone}
              />
            </div>
          )}
        </section>

        {/* 2. セーフエリア */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">セーフエリア確認</h2>
          {!info ? (
            <p className="text-sm text-slate-500">取得中...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <InfoRow label="上 (top)"    value={info.safeTop}    />
                <InfoRow label="下 (bottom)" value={info.safeBottom} highlight={info.safeBottom !== '0px'} />
                <InfoRow label="左 (left)"   value={info.safeLeft}   />
                <InfoRow label="右 (right)"  value={info.safeRight}  />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                iPhone X 以降: bottom ≒ 34px / 最新モデル ≒ 21px が正常値。<br />
                全て 0px の場合は viewport-fit=cover が効いていない可能性があります。
              </p>

              {/* セーフエリア視覚確認用 */}
              <div className="mt-3 rounded-xl overflow-hidden border border-slate-200">
                <div className="bg-slate-800 text-white text-xs font-semibold px-3 py-2">
                  下部セーフエリア 視覚確認
                </div>
                <div className="bg-white px-3 pt-3">
                  <div className="bg-blue-100 border border-blue-300 rounded px-3 py-2 text-xs text-blue-800 font-medium">
                    ▲ コンテンツ（ここまで表示されるべき）
                  </div>
                  <div
                    className="bg-red-100 border border-red-300 rounded px-3 py-2 text-xs text-red-800 font-medium mt-1"
                    style={{ height: info.safeBottom !== '0px' ? info.safeBottom : '20px' }}
                  >
                    ▼ セーフエリア（{info.safeBottom}）
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* 3. 主要ページリンク */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">確認ページ一覧</h2>
          <div className="space-y-2">
            {MAIN_PAGES.map(({ href, label, check }) => (
              <Link
                key={href}
                href={href}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <span className="font-semibold text-blue-700 text-sm shrink-0 pt-0.5">{label}</span>
                <span className="text-xs text-slate-500 leading-relaxed">{check}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* 4. チェックリスト */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">確認チェックリスト</h2>
            <span className="text-sm font-semibold text-slate-600">
              {checkedCount} / {CHECK_ITEMS.length}
            </span>
          </div>
          <div className="space-y-2">
            {CHECK_ITEMS.map(item => (
              <label
                key={item}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!checked[item]}
                  onChange={() => toggleCheck(item)}
                  className="w-5 h-5 rounded accent-blue-600 shrink-0"
                />
                <span className={`text-sm ${checked[item] ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>
          {checkedCount === CHECK_ITEMS.length && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-semibold text-green-800">
              ✅ 全項目チェック完了！スマホ対応は問題ありません。
            </div>
          )}
        </section>

        {/* 5. manifest 確認リンク */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900">PWA manifest 確認</h2>
          <a
            href="/manifest.webmanifest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-slate-100 transition-colors"
          >
            /manifest.webmanifest を開く →
          </a>
          <p className="text-xs text-slate-500">
            name, icons, display: standalone が設定されていることを確認してください。
          </p>
        </section>

        <p className="text-xs text-center text-slate-400 pb-4">
          このページはスマホ確認専用です。顧客情報は含みません。
        </p>
      </div>
    </div>
  )
}

function InfoRow({
  label, value, highlight,
}: { label: string; value: string; highlight?: boolean }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-green-700' : 'text-slate-900'}`}>
        {value}
      </span>
    </>
  )
}
