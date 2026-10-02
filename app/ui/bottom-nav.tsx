'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logoutAction } from '../actions/logout'

type NavItem = {
  href:     string
  label:    string
  icon:     string
  /** 開発者限定。運営・セラピストのメニューには出さない。 */
  devOnly?: boolean
}

const mainItems: NavItem[] = [
  { href: '/',              label: 'ホーム',   icon: '📊' },
  { href: '/customers',     label: '顧客',     icon: '👥' },
  { href: '/alerts',        label: 'アラート', icon: '🔔' },
  { href: '/anniversaries', label: '記念日',   icon: '🎂' },
  { href: '/orders',        label: 'オーダー', icon: '📋' },
]

const moreItems: NavItem[] = [
  { href: '/predictions',    label: '来店予測',     icon: '📈' },
  { href: '/monthly-summary', label: '月次まとめ',  icon: '📅' },
  { href: '/candidates',     label: '顧客登録候補', icon: '✨' },
  { href: '/sync',           label: '同期/管理',    icon: '↻' },
  { href: '/help',           label: 'ヘルプ',       icon: '❓' },
  { href: '/settings',       label: '設定',         icon: '⚙️', devOnly: true },
]

export default function BottomNav({ isDeveloper = false }: { isDeveloper?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ドロワー */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl pb-safe">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <span className="text-white font-bold">メニュー</span>
              <button onClick={() => setOpen(false)} className="text-slate-400 text-2xl leading-none">×</button>
            </div>
            <nav className="p-4 grid grid-cols-3 gap-3">
              {moreItems.filter((item) => !item.devOnly || isDeveloper).map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl py-4 transition-colors ${
                      isActive ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
            <div className="p-4 border-t border-slate-700">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-slate-800 text-slate-300 text-sm font-medium"
                >
                  <span>🚪</span> ログアウト
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* BottomNav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-slate-900 border-t border-slate-700 safe-area-pb">
        <div className="flex">
          {mainItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center justify-center py-3 gap-0.5 min-h-[60px] transition-colors ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-white active:text-white'
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setOpen(true)}
            className="flex flex-1 flex-col items-center justify-center py-3 gap-0.5 min-h-[60px] text-slate-400 hover:text-white active:text-white transition-colors"
          >
            <span className="text-lg leading-none">☰</span>
            <span className="text-[10px] font-semibold">もっと見る</span>
          </button>
        </div>
      </nav>
    </>
  )
}
