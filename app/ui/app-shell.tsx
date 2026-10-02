'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './sidebar'
import BottomNav from './bottom-nav'

export default function AppShell({
  children,
  isDeveloper = false,
}: {
  children: React.ReactNode
  /** 開発者限定メニューを表示するか。RootLayout が hasDevAccess() の結果を渡す。 */
  isDeveloper?: boolean
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  return (
    <>
      {!isLoginPage && <Sidebar isDeveloper={isDeveloper} />}
      <main className="flex-1 overflow-y-auto pb-nav md:pb-0">
        {children}
      </main>
      {!isLoginPage && <BottomNav isDeveloper={isDeveloper} />}
    </>
  )
}
