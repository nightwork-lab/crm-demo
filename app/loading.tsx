/**
 * 全ページ共通のローディングスケルトン。
 * ページ遷移時、サーバーがデータを取得している間に即座に表示される
 * （Next.js の loading.tsx 規約 = ルート配下全セグメントの Suspense fallback）。
 * 体感速度の改善が目的で、実処理時間は変わらない。
 */
export default function Loading() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl animate-pulse" aria-label="読み込み中">
      {/* ヘッダー */}
      <div className="space-y-2">
        <div className="h-4 w-16 rounded bg-slate-200" />
        <div className="h-7 w-48 rounded bg-slate-300" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-200" />
      </div>

      {/* KPI カード風 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="h-24 rounded-2xl bg-slate-200 col-span-2 md:col-span-1" />
        <div className="h-24 rounded-2xl bg-slate-200" />
        <div className="h-24 rounded-2xl bg-slate-200" />
      </div>

      {/* リスト風 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
        <div className="h-5 w-40 rounded bg-slate-300" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-2/3 rounded bg-slate-100" />
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
        <div className="h-5 w-32 rounded bg-slate-300" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
      </div>
    </div>
  )
}
