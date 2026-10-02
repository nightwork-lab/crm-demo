/**
 * 「従業員として閲覧中」バナー。Server Component。
 * 閲覧モード中のみ画面上部に固定表示される。
 */
import { getAdminViewAs } from '../lib/admin-view'
import { endViewAsAction } from '../actions/admin-view'

export default async function AdminViewBanner() {
  const view = await getAdminViewAs()
  if (!view) return null

  return (
    <div className="sticky top-0 z-[60] bg-indigo-700 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
      <p className="text-sm font-semibold truncate">
        👁 「{view.displayName}」さんのデータを閲覧中（読み取り専用）
      </p>
      <form action={endViewAsAction}>
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-bold transition-colors"
        >
          閲覧を終了
        </button>
      </form>
    </div>
  )
}
