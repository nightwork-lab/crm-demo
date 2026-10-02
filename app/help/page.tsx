/**
 * ヘルプページ。
 * 「新人はとりあえずここを見ればOK」の単一入口。
 * 中身（マニュアル・Q&A）は Notion 側で運営が育てるため、
 * このページは静的なリンク集としてメンテナンス不要に保つ。
 */
import type { ReactNode } from 'react'

// マニュアルの Notion ページ URL。
// 運営の共有方式は「セラピスト70名をNotionに招待」（Web公開ではない）。
// このURLは招待済みユーザーがNotionログイン状態で開ける。
// 将来 Web公開に切り替えた場合は公開URL（notion.site）へ差し替えること。
const MANUAL_URL = 'https://www.notion.so/3bef6f80e442806f8072e62f3b93186a'

/** 開閉式のQ&A項目（JSのみで動く details/summary） */
function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-slate-100 last:border-b-0">
      <summary className="flex items-start gap-2 py-2.5 cursor-pointer list-none text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        <span className="text-slate-400 group-open:rotate-90 transition-transform shrink-0 mt-0.5">▸</span>
        <span>Q. {q}</span>
      </summary>
      <p className="pb-3 pl-6 text-sm text-slate-700">{children}</p>
    </details>
  )
}

export default function HelpPage() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <header>
        <p className="text-sm text-slate-700">サポート</p>
        <h1 className="text-2xl font-bold mt-1 text-slate-900">ヘルプ</h1>
        <p className="text-sm text-slate-700 mt-1">
          使い方に迷ったら、まずここから。
        </p>
      </header>

      {/* マニュアル */}
      <a
        href={MANUAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-2xl bg-blue-600 p-5 shadow-sm hover:bg-blue-700 transition-colors"
      >
        <p className="text-lg font-bold text-white">📖 使い方マニュアルを開く</p>
        <p className="text-sm text-blue-100 mt-1">
          はじめての設定から全機能の使い方・よくある質問まで。
          目次から知りたい項目にジャンプできます。
        </p>
        <p className="text-xs text-blue-200 mt-2">
          ※ Notionのページが開きます（お店から招待されているNotionアカウントでのログインが必要です）
        </p>
      </a>

      {/* よくあるつまずき */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-3">よくあるつまずき TOP3</h2>
        <div className="space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">今日の予約・売上が反映されない</p>
            <p className="text-slate-700 mt-0.5">
              データは<strong>毎朝5時ごろ</strong>に前日分まで自動で取り込まれます。今日の分は明日の朝に反映されます。
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">来店予測が保存されない</p>
            <p className="text-slate-700 mt-0.5">
              入力後、画面下の「<strong>全て保存</strong>」ボタンを押してください。入力だけでは保存されません。
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">パスワードを忘れた</p>
            <p className="text-slate-700 mt-0.5">
              ご自身では再設定できません。<strong>運営（内勤さん）へ連絡</strong>してください。
            </p>
          </div>
        </div>
      </section>

      {/* よくある質問 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-1">❓ よくある質問</h2>
        <p className="text-xs text-slate-500 mb-3">質問をタップすると答えが開きます</p>

        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1">登録・ログイン</p>
        <Faq q="アプリのダウンロードは必要ですか？">
          不要です。ブラウザでそのまま使えます。スマホの「ホーム画面に追加」（iPhoneは共有ボタン→ホーム画面に追加、Androidはメニュー⋮→ホーム画面に追加）でアプリのように使えます。
        </Faq>
        <Faq q="登録用リンクを開いても登録できません">
          有効期限が切れている可能性があります。運営に再発行を依頼してください。
        </Faq>
        <Faq q="パスワードを忘れました">
          ご自身では再設定できません。運営（内勤さん）へ連絡してください。再設定の手続きをします。
        </Faq>
        <Faq q="機種変更したらどうなりますか？">
          新しいスマホのブラウザで同じURLを開き、同じメールアドレスとパスワードでログインすれば、データはすべてそのまま使えます。
        </Faq>

        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1">データについて</p>
        <Faq q="登録したのにデータが空です">
          過去データの取り込みは登録後に行われます。1〜2日待っても空の場合は運営にご連絡ください。
        </Faq>
        <Faq q="昨日の予約が反映されていません">
          データ取り込みは毎朝5時ごろの1日1回です。昨日の分は今朝、今日の分は明朝に反映されます。
        </Faq>
        <Faq q="売上の数字が実際と違う気がします">
          キャンセル・仮予約は集計から除外されています。それでも合わない場合は、happ の元データと見比べて運営にご連絡ください。
        </Faq>
        <Faq q="お客様が一覧に出てきません">
          まだ顧客登録されていない可能性があります。「顧客登録候補」のページから登録してください。
        </Faq>
        <Faq q="同じお客様が2人に分かれています">
          happ 上で別IDになっているためです。「顧客登録候補」の「既存顧客に紐付け」で1人にまとめられます。
        </Faq>
        <Faq q="他の人に自分のデータは見えますか？">
          見えません。あなたのお客様・売上はあなただけのものです。メモも運営を含め誰にも見えません。
        </Faq>

        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1">使い方について</p>
        <Faq q="来店予測は必ず入力しないとダメですか？">
          必須ではありません。ただ入力すると達成率・差分が見られるようになり、月の途中で「来ていない常連さん」に気づけるようになります。
        </Faq>
        <Faq q="予測を入力したのに保存されていません">
          画面下の「全て保存」ボタンを押してください。入力しただけでは保存されません。
        </Faq>
        <Faq q="過去の月のデータを見たい">
          「月次まとめ」で中央の年月表示をタップすると、好きな年月にジャンプできます。
        </Faq>
        <Faq q="予約ごとにメモは付けられますか？">
          予約1件ごとのメモ機能はありません。代わりに顧客メモに日付をつけて書く使い方がおすすめです（例：8/28 アロマ120分。次回は指圧強めご希望）。
        </Faq>
        <Faq q="予約の場所（ホテル名など）が見たい">
          happ のデータに場所情報が含まれていないため、アプリでは表示できません。happ 本体でご確認ください。
        </Faq>
        <Faq q="間違えて紐付け・登録をしてしまった">
          顧客情報（名前・タグ・メモ）は編集で修正できます。紐付けの解除は画面からはできないため、運営に連絡してください。
        </Faq>

        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1">その他</p>
        <Faq q="退店したらデータはどうなりますか？">
          アカウントは運営が停止し、アプリのデータにアクセスできなくなります（データ自体は削除されません）。
        </Faq>
        <Faq q="通信量・料金はかかりますか？">
          アプリ自体は無料です。通常のWebページ閲覧程度の通信量です。
        </Faq>
      </section>

      {/* 問い合わせ先 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-3">🆘 困ったときは</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          <li>
            まずマニュアルの「<a href={MANUAL_URL} target="_blank" rel="noopener noreferrer" className="text-blue-700 font-semibold hover:underline">よくある質問</a>」を確認
          </li>
          <li>
            解決しなければ<strong>運営（内勤さん）へ連絡</strong>（Telegram）
          </li>
          <li>
            エラー・表示崩れなどの不具合は、<strong>画面のスクリーンショット</strong>を添えると解決が早くなります
          </li>
        </ol>
      </section>
    </div>
  )
}
