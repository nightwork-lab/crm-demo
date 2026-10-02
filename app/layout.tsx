import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "./ui/app-shell";
import AdminViewBanner from "./ui/admin-view-banner";
import { hasDevAccessForNav } from "./lib/auth-context";

export const metadata: Metadata = {
  title:       '顧客管理 CRM',
  description: '顧客管理・来店アラート・売上管理アプリ',
  appleWebApp: {
    capable:         true,
    statusBarStyle:  'default',
    title:           'CRM',
  },
  icons: {
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor:   '#111827',
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',  // iOS セーフエリア対応（env(safe-area-inset-*) を有効化）
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 開発者限定メニューの表示可否（表示制御のみ／認証サーバーへの往復なし）。
  // 実際のアクセス制御は各ページの hasDevAccess() が行う。
  const isDeveloper = await hasDevAccessForNav();

  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="h-full flex flex-col bg-slate-100 text-slate-900">
        <AdminViewBanner />
        <div className="flex flex-1 min-h-0">
          <AppShell isDeveloper={isDeveloper}>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
