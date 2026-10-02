import { redirect } from 'next/navigation'
import { hasDevAccess } from '../lib/auth-context'
import { isCalendarSyncEnabled, isVercelEnvironment } from '../lib/app-mode'
import { hasGoogleCredentials, getConfiguredCalendarIds } from '../lib/google-calendar'
import CalendarSyncPanel from '../ui/calendar-sync-panel'

// Google API への往復が予約件数に比例して増えるため、既定の実行時間では足りない。
// 本番で使う場合は Vercel のプラン上限内であることを確認すること。
export const maxDuration = 60

export default async function SettingsPage() {
  // 開発者限定。運営・セラピストはダッシュボードへ戻す。
  if (!(await hasDevAccess())) redirect('/')

  const calendarEnabled = isCalendarSyncEnabled()
  // 判定は google-calendar.ts の1か所だけに置く。ここで書き写すと実態とずれる。
  const hasCredentials      = hasGoogleCredentials()
  const calendarIds         = getConfiguredCalendarIds()
  const configured          = Boolean(hasCredentials && calendarIds.confirmed)
  // 仮予約は別カレンダーへ入れる。未設定でも確定側は使えるため警告に留める。
  const tentativeConfigured = Boolean(hasCredentials && calendarIds.tentative)
  // ローカルで設定済みのときだけ、本番へ移すための値を画面に出す
  const showDeployHelp      = configured && !isVercelEnvironment()

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <header>
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-700">管理</p>
          <span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">
            開発者限定
          </span>
        </div>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">設定</h1>
        <p className="text-sm text-slate-700 mt-1">
          この画面はあなたのアカウントにだけ表示されます
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Google カレンダー連携</h2>
            <span
              className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                configured ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {configured ? '設定済み' : '未設定'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            今日以降の予約（キャンセル・仮予約を除く）をカレンダーへ一括反映します。
            何度実行しても重複しません。
          </p>
          <p className="text-sm text-slate-600 mt-2">
            <strong className="text-slate-900">予定は削除しません。</strong>
            削除APIを呼ぶ実装自体を持っていないため、この機能でカレンダーの予定が消えることはありません。
            予約がキャンセルされた場合はタイトルに【キャンセル】を付けて残すので、消すかどうかはご自身で判断できます。
            過去の予定と、手で入れた予定にも一切触れません。
          </p>
        </div>

        {configured && !tentativeConfigured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">仮予約用のカレンダーが未設定です</p>
            <p className="mt-0.5 text-amber-800">
              仮予約は確定予約と別のカレンダーに入れます。もう1つカレンダーを作って
              サービスアカウントに「予定の変更権限」で共有し、そのIDを
              <code className="bg-white/60 px-1 py-0.5 rounded mx-1">GOOGLE_CALENDAR_ID_TENTATIVE</code>
              に設定してください。確定予約の同期は今のまま使えます。
            </p>
          </div>
        )}

        <CalendarSyncPanel disabled={!calendarEnabled} />
      </section>

      {showDeployHelp && (
        <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">本番（Vercel）で使えるようにする</h2>
          <p className="text-sm text-slate-600 mt-1">
            Vercel の Settings → Environment Variables に、次の3つを追加して再デプロイしてください。
            追加すれば本番でも自動で有効になります（この画面は引き続きあなたにしか表示されません）。
          </p>

          <ol className="mt-3 space-y-3 text-sm text-slate-700 list-decimal list-inside">
            <li>
              <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">GOOGLE_SA_KEY_JSON</code>
              <span className="block ml-5 mt-1 text-slate-600">
                ダウンロード済みのサービスアカウント JSON ファイルを開き、
                <strong className="text-slate-900">中身を全選択してそのまま貼り付け</strong>ます。
                改行の加工は不要です。
              </span>
            </li>
            <li>
              <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">GOOGLE_CALENDAR_ID</code>
              <span className="block ml-5 mt-1">
                <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all select-all">
                  {calendarIds.confirmed}
                </code>
              </span>
            </li>
            <li>
              <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">GOOGLE_CALENDAR_ID_TENTATIVE</code>
              <span className="block ml-5 mt-1">
                {calendarIds.tentative ? (
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all select-all">
                    {calendarIds.tentative}
                  </code>
                ) : (
                  <span className="text-amber-700">（ローカルでも未設定です。仮予約を使わないなら不要）</span>
                )}
              </span>
            </li>
          </ol>

          <p className="text-xs text-slate-500 mt-3">
            ローカルで使っている
            <code className="bg-slate-100 px-1 py-0.5 rounded mx-1">GOOGLE_SA_KEY_FILE</code>
            は Vercel では使えません（サーバー上にファイルが無いため）。本番は上の JSON 貼り付け方式を使います。
            一時的に止めたいときは
            <code className="bg-slate-100 px-1 py-0.5 rounded mx-1">CALENDAR_SYNC_ENABLED=false</code>
            を追加すれば、鍵を消さずに無効化できます。
          </p>
        </section>
      )}

      {!configured && (
        <section className="rounded-2xl bg-white p-5 md:p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">初回セットアップ</h2>
          <p className="text-sm text-slate-600 mt-1">
            サービスアカウント方式です。OAuth の同意画面もトークンの更新管理も不要になります。
          </p>
          <ol className="mt-3 space-y-2 text-sm text-slate-700 list-decimal list-inside">
            <li>
              Google Cloud Console で新規プロジェクトを作り、
              <span className="font-medium">Google Calendar API</span> を有効化する
            </li>
            <li>
              サービスアカウントを作成し、JSON キーを発行する
            </li>
            <li>
              Google カレンダーで<span className="font-medium">専用のカレンダーを新規作成</span>し、
              その設定画面でサービスアカウントのメールアドレスを
              <span className="font-medium">「予定の変更権限」</span>で共有する
            </li>
            <li>
              JSON キーをリポジトリ外に置き、ローカルの環境変数に
              <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">GOOGLE_SA_KEY_FILE</code>
              （そのフルパス）と
              <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">GOOGLE_CALENDAR_ID</code>
              を設定して dev サーバーを再起動する
            </li>
          </ol>
          <p className="text-xs text-slate-500 mt-3">
            鍵ファイルを使わず直接貼る場合は
            <code className="bg-slate-100 px-1 py-0.5 rounded">GOOGLE_SA_EMAIL</code> と
            <code className="bg-slate-100 px-1 py-0.5 rounded">GOOGLE_SA_PRIVATE_KEY</code>
            でも可（秘密鍵の改行をエスケープする必要があります）。
            顧客名なし版を別カレンダーに分けたい場合は
            <code className="bg-slate-100 px-1 py-0.5 rounded">GOOGLE_CALENDAR_ID_ANON</code>
            も設定してください。未設定なら両方とも同じカレンダーに入ります。
          </p>
        </section>
      )}
    </div>
  )
}
