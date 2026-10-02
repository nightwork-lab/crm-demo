'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '../actions/logout'

type NavItem = {
  href:     string
  label:    string
  icon:     string
  /** 開発者限定。運営・セラピストのメニューには出さない。 */
  devOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/',              label: 'ダッシュボード', icon: '📊' },
  { href: '/customers',     label: '顧客一覧',       icon: '👥' },
  { href: '/alerts',        label: '来店アラート',   icon: '🔔' },
  { href: '/anniversaries', label: '記念日',         icon: '🎂' },
  { href: '/predictions',   label: '来店予測',       icon: '📈' },
  { href: '/monthly-summary', label: '月次まとめ',   icon: '📅' },
  { href: '/orders',        label: '外部オーダー',   icon: '📋' },
  { href: '/candidates',    label: '顧客登録候補',   icon: '✨' },
  { href: '/sync',          label: '同期/管理',      icon: '↻' },
  { href: '/help',          label: 'ヘルプ',         icon: '❓' },
  { href: '/settings',      label: '設定',           icon: '⚙️', devOnly: true },
]

export default function Sidebar({ isDeveloper = false }: { isDeveloper?: boolean }) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-56 shrink-0 bg-slate-900 text-white flex-col min-h-screen">
      <div className="p-5 border-b border-slate-700">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Customer CRM</p>
        <p className="mt-1 text-lg font-bold">顧客管理</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.filter((item) => !item.devOnly || isDeveloper).map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-slate-700 space-y-2">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <span>🚪</span>
            ログアウト
          </button>
        </form>
        <p className="text-xs text-slate-400">v1.0.0</p>
      </div>
    </aside>
  )
}
