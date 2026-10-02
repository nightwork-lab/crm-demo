@AGENTS.md

## このプロジェクトについて

happ-s.com 連携の顧客管理 CRM。Next.js 16（App Router）+ Tailwind CSS + Supabase。
詳細は README.md を参照。

---

## セキュリティルール — 必ず守ること

### 絶対に表示・出力してはいけない情報

- `.env.local` の内容（いかなる形式でも出力しない）
- `SUPABASE_*` / `HAPP_*` / `APP_AUTH_*` の実際の値（環境変数はキー名のみ扱う）
- `data/*.json` の中身（顧客名・売上明細・メモ本文を含むため）

### 明示的な許可なしに実行・変更してはいけないこと

- `npm run import:supabase:confirm` — 二重実行で既存データ上書きの恐れ。取り消し不可
- `git push --force` / `data/*.json` の直接削除
- `APP_READONLY` の値・Vercel 環境変数（ダッシュボード含む）
- happ 同期処理（`app/lib/happ-sync.ts`, `app/lib/happ-history.ts`, `scripts/sync-happ.ts`）
- 集計ロジック（`app/lib/order-metrics.ts` — 全ページの集計基準がここに集約）
- Supabase へのデータ追加投入

---

## データ構成

| データ | 正典 | Supabase 対応 |
|---|---|---|
| customers / happ_orders / customer_links | JSON または Supabase（`DATA_SOURCE` で切替） | 読み取りのみ |
| customer-predictions / monthly-targets | **JSON のみ** | 未対応 |

- `DATA_SOURCE=json`（デフォルト）→ `data/*.json` から読む / `supabase` → 読み取り専用
- `APP_READONLY=true` → 書き込み操作を全無効化。**Vercel 本番は常に true**（Supabase 書き込み対応完了まで変更しない）

---

## 完了条件

機能追加・修正は以下を通してから完了とする:

1. `npx tsc --noEmit`（エラーゼロ）
2. `npm run build`
3. 影響ページの目視確認（最低限: / /predictions /monthly-summary /customers /alerts）

---

## アーキテクチャの注意点

- `app/lib/repository/` — データ取得の抽象レイヤー。ページからはここを経由する
- `app/lib/order-metrics.ts` — 集計ロジックの唯一の定義元。独自集計を追加しない
- `app/lib/app-mode.ts` — `isReadonlyMode()` / `isVercelEnvironment()` の定義元
- `app/lib/cache.ts` — JSON 読み込みの 30 秒 TTL キャッシュ。書き込み後に `invalidateDataCache()` を呼ぶこと
- `app/actions/` — Server Actions。全て先頭で `isReadonlyMode()` チェックを行うこと
- `app/lib/supabase-server.ts` — service_role キーを使うサーバー専用クライアント。Client Component からインポートしない

---

## dev サーバー / Git 操作

- 再起動・ポート 3000 の競合解消は skill **dev-server-restart** の手順に従う（`npm run dev:clean` 優先・二重起動禁止）
- コミットは skill **safe-commit** の手順に従う（`git add .` 禁止・`git diff --cached --name-only` で混入確認）
