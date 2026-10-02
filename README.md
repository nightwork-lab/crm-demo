# 顧客管理 CRM

happ-s.com 連携の顧客管理・来店アラート・売上管理アプリ。  
Next.js 16（App Router）+ Tailwind CSS + Supabase（読み取り専用）。

---

## クイックスタート（ローカル起動）

```bash
# 1. 依存パッケージをインストール
npm install

# 2. .env.local を作成して必要な変数を設定（後述の「環境変数一覧」を参照）

# 3. 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開く。  
ローカルでは `.env.local` に `AUTH_ENABLED=false` を設定すると認証をスキップできます。

---

## 環境変数一覧

`.env.local` に設定する環境変数。**値はここに書かない。キー名と用途のみ記載。**

### 認証

| 変数名 | 必須 | 用途 |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 本番必須 | Supabase Auth によるログイン（`proxy.ts`）。両方未設定なら認証をスキップ |
| `DEMO_BASIC_AUTH_USER` | デモ公開時のみ | デモ環境の Basic 認証ユーザー名。`DEMO_BASIC_AUTH_PASS` と両方設定した時だけ有効 |
| `DEMO_BASIC_AUTH_PASS` | デモ公開時のみ | デモ環境の Basic 認証パスワード（20文字以上推奨） |

※ 旧仕様の `AUTH_ENABLED` / `APP_AUTH_USER` / `APP_AUTH_PASS` は現在のコードでは参照されない（以降の記述は旧仕様の名残）。

### アプリ動作

| 変数名 | 必須 | 用途 |
|---|---|---|
| `APP_READONLY` | Vercel公開時必須 | `true` にすると書き込み操作を全て無効化。Vercel公開時は必ず `true` |
| `DATA_SOURCE` | — | データ読み取り元。`json`（デフォルト）または `supabase`。未設定時は `json` |

### happ 同期

| 変数名 | 必須 | 用途 |
|---|---|---|
| `HAPP_TEL` | 同期実行時必須 | happ-s.com のログイン電話番号 |
| `HAPP_PASS` | 同期実行時必須 | happ-s.com のログインパスワード |

### Supabase（DATA_SOURCE=supabase のときのみ使用）

| 変数名 | 必須 | 用途 |
|---|---|---|
| `SUPABASE_URL` | DATA_SOURCE=supabase 時必須 | Supabase プロジェクトの URL |
| `SUPABASE_SERVICE_ROLE_KEY` | DATA_SOURCE=supabase 時必須 | service_role キー。絶対に外部に漏らさない |
| `SUPABASE_ANON_KEY` | **現時点では未使用** | 現在のコードでは参照していない |

### 自動設定（手動設定不要）

| 変数名 | 用途 |
|---|---|
| `VERCEL` | Vercel 環境で自動的に `1` が設定される |

---

## デモモード（ダミーデータで動かす）

営業デモや動作確認のために、実データ（`data/*.json`）に触れずにダミーデータで起動できます。

```bash
# 1. ダミーデータを data/demo/ に生成（固定シードなので毎回同じ内容）
npm run demo:generate            # 既にある場合は -- --force で上書き

# 2. ダミーデータで起動（閲覧専用・認証なし）
npm run dev:demo
```

- 切替は環境変数 `DATA_DIR`（既定 `data`）。`DATA_DIR=data/demo` で読み書き先がデモ用ディレクトリになる
- Vercel でデモ環境を作る場合は、環境変数に `DATA_DIR=data/demo` と `APP_READONLY=true` を設定する。`SUPABASE_*` は設定しない（ログイン画面を出さない）
- デモ環境を Basic 認証で守るには `DEMO_BASIC_AUTH_USER` と `DEMO_BASIC_AUTH_PASS` を両方設定する（`proxy.ts`）。両方そろった時だけ有効で、本番には影響しない。未認証は 401 を返す
- happ 同期（`sync:happ` / `sync:happ-history`）は `DATA_DIR` の対象外で、常に `data/` に書く。デモ環境では同期を実行しないこと
- ダミーデータは架空の氏名・金額のみ。`customer-predictions.json` もデモ用のものを `data/demo/` に含む

---

## npm scripts 一覧

| コマンド | 内容 | 注意 |
|---|---|---|
| `npm run dev` | ローカル開発サーバーを起動（通常はこちら） | |
| `npm run dev:clean` | ポート 3000 の既存プロセスを停止してからクリーン起動 | 起動が遅い・3000/3001 混在・Ready なのに開かない場合に使う |
| `npm run build` | 本番ビルド（エラーチェックにも使う） | |
| `npm run lint` | ESLint を実行 | |
| `npm run sync:happ` | happ-s.com からオーダーを取得して `data/happ-orders.json` を更新 | ローカルのみ。`HAPP_TEL`/`HAPP_PASS` が必要 |
| `npm run sync:happ-history` | happ の過去履歴データを取得 | ローカルのみ |
| `npm run backup:data` | `data/*.json` をタイムスタンプ付きで `data/backups/` にコピー | |
| `npm run restore:data` | バックアップから復元。`--confirm` なしは dry-run | |
| `npm run validate:data` | データ整合性チェック（重複ID・孤立リンクなど） | |
| `npm run report:hours` | セラピストとしての稼働時間（接客時間）を月別に集計。`-- --weekly` で週別、`-- --json` で JSON | 顧客名・金額は出力しない |
| `npm run import:supabase` | Supabase インポートの **dry-run**（何も変更しない） | |
| `npm run import:supabase:confirm` | **Supabase に実データを投入する。取り消し不可。** | ⚠ 明示許可なしに実行しない。二重実行すると既存データ上書き・想定外差分の原因になる可能性がある |

---

## 主要ページ一覧

| URL | 内容 |
|---|---|
| `/` | ダッシュボード（KPI・アラートサマリ） |
| `/customers` | 顧客一覧・検索 |
| `/customers/[id]` | 顧客詳細・来店履歴・予測 |
| `/alerts` | 来店アラート |
| `/anniversaries` | 記念日リスト |
| `/predictions` | 来店予測管理（月別・インライン入力・ソート） |
| `/monthly-summary` | 月次まとめ（日別チャート・顧客ランキング） |
| `/orders` | 外部オーダー一覧 |
| `/candidates` | 顧客登録候補 |
| `/sync` | happ 同期・管理 |
| `/settings` | 設定 |
| `/mobile-check` | スマホ動作確認ツール |
| `/supabase-check` | Supabase 接続確認・JSON vs Supabase 件数照合 |

---

## DATA_SOURCE とデータ構成

### DATA_SOURCE の切り替え

```
DATA_SOURCE=json     → data/*.json を読み取る（デフォルト。未設定時も同じ動作）
DATA_SOURCE=supabase → Supabase から読み取る（読み取りのみ対応）
```

### 用途別・データの所在

| 用途 | データの所在 |
|---|---|
| **Vercel 本番（スマホ閲覧）** | Supabase から読み取り（`DATA_SOURCE=supabase`） |
| **ローカル開発・同期・編集** | `data/*.json` から読み取り（`DATA_SOURCE=json`、デフォルト） |

### データ種別ごとの対応状況

| データ | ローカル正典 | Supabase 読み取り | Supabase 書き込み |
|---|---|---|---|
| 顧客（customers） | `data/customers.json` | 対応済み | **未対応** |
| オーダー（happ_orders） | `data/happ-orders.json` | 対応済み | **未対応** |
| 顧客紐付け（customer_links） | `data/customer-links.json` | 対応済み | **未対応** |
| 来店予測（predictions） | `data/customer-predictions.json` | **未対応** | **未対応** |
| 月次目標（monthly-targets） | `data/monthly-targets.json` | **未対応** | **未対応** |

> **現時点の書き込みは全て JSON ファイルへ行われる。**  
> Vercel 本番は `APP_READONLY=true` のため書き込み操作は全て無効化されている。

### Supabase の現在の役割

- **読み取り専用**（Phase 1 完了）。customers / happ_orders / customer_links のみ対応。
- 書き込み対応は未実装。Supabase 書き込み対応完了後に `APP_READONLY=false` へ移行予定。
- `/supabase-check` で JSON 件数と Supabase 件数を照合できる。

### Vercel の役割

- 本番環境（スマホからの閲覧専用アクセス）。
- `APP_READONLY=true` のためデータ書き込みは全て無効。
- 同期・編集は Mac のローカル環境で行い、push → 自動デプロイで Vercel に反映する。

---

## 認証設定

すべてのページ・操作は Basic 認証で保護されています（`proxy.ts` — Next.js 16 の Proxy）。  
静的アセット（`/_next/static`, `/_next/image`, `/favicon.ico`）は除外。  
Server Actions（同期・顧客更新など）も含め、全リクエストが認証対象。

### ローカル開発（認証スキップ）

`.env.local` に以下を設定すると認証をスキップできます。

```
AUTH_ENABLED=false
```

### Vercel 公開時（認証有効）

Vercel のダッシュボードの「Environment Variables」に以下を設定してください。  
**実際の値をこのファイル・README・チャットに記載しないこと。**

```
AUTH_ENABLED=true
APP_AUTH_USER=<ユーザー名>
APP_AUTH_PASS=<20文字以上のランダムパスワード>
```

- `APP_AUTH_USER` / `APP_AUTH_PASS` が未設定の場合は **503** を返します（空でアクセス不可）。
- ブラウザが認証情報をキャッシュするので、一度入力すれば再入力は不要です。

### AUTH_ENABLED=true の動作テスト手順

**⚠ 本番の HAPP_TEL / HAPP_PASS は使わない。テスト用の一時値で確認すること。**

#### 手順1: `.env.local` にテスト用の一時値を追加

```
# テスト用（終了後に必ず削除またはコメントアウト）
AUTH_ENABLED=true
APP_AUTH_USER=testadmin
APP_AUTH_PASS=TestPassword123456789
```

#### 手順2: dev サーバーを再起動

```bash
npm run dev
```

#### 手順3: curl でテスト

```bash
# 認証なし → 401 が返ることを確認
curl -v http://localhost:3000/
# 期待値: HTTP/1.1 401, WWW-Authenticate: Basic realm="Customer CRM"

# 正しい認証 → 200 が返ることを確認
curl -v -u testadmin:TestPassword123456789 http://localhost:3000/
# 期待値: HTTP/1.1 200

# 誤ったパスワード → 401 が返ることを確認
curl -v -u testadmin:wrongpassword http://localhost:3000/
# 期待値: HTTP/1.1 401
```

#### 手順4: テスト後に元に戻す（必須）

`.env.local` を以下に戻してから dev サーバーを再起動:

```
AUTH_ENABLED=false
# APP_AUTH_USER=testadmin     ← この行を削除またはコメントアウト
# APP_AUTH_PASS=TestPassword123456789  ← この行を削除またはコメントアウト
```

---

## デプロイ手順（Vercel）

### Step 1: GitHub private repository を作成

1. https://github.com/new を開く
2. Repository name を入力（例: `custmer-crm`）
3. **「Private」を必ず選択**（Public は絶対に選ばない）
4. README / .gitignore の自動生成は **チェックを外す**
5. 「Create repository」をクリック

### Step 2: ローカルで push

```bash
git remote add origin https://github.com/<GitHubユーザー名>/custmer-crm.git
git branch -M main
git push -u origin main
```

**push 前の確認（必須）:**

```bash
# .env.local が対象外であることを確認（出力があれば安全）
git check-ignore .env.local

# data/backups/ が対象外であることを確認
git check-ignore data/backups/

# git add . は使わない。対象ファイルを明示して add する
git status --short
```

### Step 3: Vercel に接続して環境変数を設定

1. https://vercel.com にアクセス
2. 「New Project」→ GitHub のリポジトリを選択
3. **Environment Variables に以下を設定**（値は安全な場所から転記）:
   - `AUTH_ENABLED` = `true`
   - `APP_AUTH_USER` = （任意のユーザー名）
   - `APP_AUTH_PASS` = （20文字以上のランダムパスワード）
   - `APP_READONLY` = `true`
4. Deploy

---

## 閲覧専用モード（APP_READONLY）

Vercel 上では `data/*.json` へのファイル書き込みが**永続化されません**。そのため、閲覧専用モードを設定してください。

```
APP_READONLY=true
```

閲覧専用モードで無効化される操作：

- happ 同期（Playwright が Vercel で動作しないため）
- 顧客追加・編集
- 顧客紐付け・解除
- 来店予測の保存
- アラート除外設定

**スマホ単体利用の流れ：**
1. Mac のローカルで同期・編集を行う
2. Vercel にデプロイ（閲覧専用）
3. スマホから確認する

> 将来的に Supabase 書き込み対応が完了すれば `APP_READONLY=false` でスマホから全操作が可能になります。

---

## ⚠ セキュリティ注意事項

### 必須ルール

| ルール | 理由 |
|---|---|
| **Vercel公開時は `AUTH_ENABLED=true` 必須** | 未設定だと顧客情報が誰でも閲覧可能 |
| **`APP_AUTH_PASS` は20文字以上のランダム文字列** | 短いパスワードはブルートフォース攻撃に脆弱 |
| **`HAPP_TEL` / `HAPP_PASS` は Vercel 環境変数に保存** | `.env.local` はローカル専用。Vercel には直接設定する |
| **`.env.local` は共有禁止** | チャット・メール・Slack への貼り付け禁止。Git にもコミットしない |
| **Claude Code にも `.env.local` の中身を表示させない** | AI ツールへの貼り付けも情報漏洩リスクになる |

### `.env.local` のセキュリティ確認

```bash
# gitignore 対象であることを確認（値は表示しない）
git check-ignore -v .env.local
# 期待値: .gitignore:XX:.env*  .env.local

# キー名のみ確認（値は絶対に表示しない）
grep -o '^[A-Z_]*' .env.local
```

### パスワード生成例

```bash
# macOS でランダムパスワードを生成（コピーして .env.local に貼り付ける）
openssl rand -base64 24
```

---

## やってはいけない操作

| 操作 | 理由 |
|---|---|
| `npm run import:supabase:confirm` を明示許可なしに実行 / 二重実行 | 既存データの上書き・sync_logs 追加・想定外差分の原因になる可能性がある。取り消し不可 |
| `data/*.json` を直接テキスト編集 | 整合性が崩れる。必ず Server Action / スクリプト経由で変更する |
| `.env.local` の内容をチャット・AI・Slack に貼る | 認証情報・APIキーの漏洩リスク |
| `git add .` を使う | `.env.local` や機密ファイルが誤ってステージされるリスクがある |
| GitHub リポジトリを public にする | 顧客情報・認証情報が全世界に公開される |
| Supabase 書き込み未対応のまま `APP_READONLY=false` にする | Vercel 上で書き込みが永続化されないまま実行されてしまう |

---

## データ管理

### バックアップ

```bash
npm run backup:data
```

`data/` 配下の JSON ファイルをタイムスタンプ付きで `data/backups/` に保存します。  
対象: `customers.json`, `customer-links.json`, `happ-orders.json`, `customer-predictions.json`（存在する場合のみ）

### 復元

```bash
# バックアップ一覧を表示
npm run restore:data -- --list

# 最新バックアップの復元内容を確認（dry-run）
npm run restore:data -- --latest

# 最新バックアップを実際に復元（復元前に現在のデータを自動バックアップ）
npm run restore:data -- --latest --confirm

# タイムスタンプを指定して復元（dry-run）
npm run restore:data -- --timestamp 20260520_124924

# タイムスタンプを指定して実際に復元
npm run restore:data -- --timestamp 20260520_124924 --confirm
```

**注意**: `--confirm` を付けない限り何も変更されません（dry-run）。  
復元後は `npm run validate:data` で整合性を確認してください。

### 整合性チェック

```bash
npm run validate:data
```

重複 ID・孤立リンク・不正ステータスなどを検出します。

### happ-s.com 同期

```bash
npm run sync:happ
```

`.env.local` に `HAPP_TEL` と `HAPP_PASS` を設定してから実行してください。  
Playwright でスクレイピングを行うため、**ローカル Mac 環境でのみ実行可能**です。

---

## スマホのホーム画面に追加（PWA）

ブラウザからホーム画面に追加すると、アプリのように起動できます。

### iPhone（Safari）

1. Safari で CRM の URL を開く
2. 画面下部の **共有ボタン**（□↑）をタップ
3. 「**ホーム画面に追加**」をタップ
4. 名前を確認して「追加」をタップ
5. ホーム画面に「CRM」アイコンが追加される

> **注意**: Safari 以外（Chrome for iOS など）ではホーム画面への追加ができない場合があります。

### Android（Chrome）

1. Chrome で CRM の URL を開く
2. 右上のメニュー（⋮）をタップ
3. 「**ホーム画面に追加**」または「**アプリをインストール**」をタップ
4. 確認ダイアログで「追加」または「インストール」をタップ
5. ホーム画面に「CRM」アイコンが追加される

### スマホ実機チェックツール

```
http://localhost:3000/mobile-check
```

以下を自動で表示・確認できます：

- 現在の画面幅 / viewport サイズ
- standalone モードかどうか（PWA として起動されているか）
- セーフエリア（env(safe-area-inset-*) の実測値）
- 主要ページへのリンク
- スマホ確認チェックリスト（タップで✔）

### スマホ実機チェックリスト

| ページ | 確認ポイント |
|---|---|
| `/` ダッシュボード | KPI数値・アラートカードが見やすいか |
| `/customers` 顧客一覧 | 検索・タグ・ソートが使いやすいか |
| `/orders` 外部オーダー | 月別アコーディオンの開閉・カード表示 |
| `/predictions` 来店予測 | 月切り替えボタン・数値表示が見やすいか |
| `/alerts` 来店アラート | アラートカードが見やすいか |
| `/monthly-summary` 月次まとめ | チャート・ランキングが表示されるか |

---

## トラブルシュート

### dev サーバーが起動しない

```bash
# 依存パッケージを再インストール
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### 認証ダイアログが出ない / 常に 401 になる

- `.env.local` の `AUTH_ENABLED` を確認（`false` でスキップ）
- `APP_AUTH_USER` / `APP_AUTH_PASS` が設定されているかキー名だけ確認 (`grep -o '^[A-Z_]*' .env.local`)
- dev サーバーを再起動する

### データが表示されない / 件数が 0 になる

```bash
# データ整合性チェック
npm run validate:data

# JSON ファイルの存在確認（中身は見ない）
ls -la data/
```

### Supabase 接続エラー

- `/supabase-check` ページで接続状態とエラーメッセージを確認
- `.env.local` に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` が設定されているか確認（値は表示しない）
- `DATA_SOURCE=supabase` になっているか確認

### ビルドが失敗する

```bash
# TypeScript エラーを確認
npx tsc --noEmit

# ビルドログを確認
npm run build
```

### happ 同期が失敗する

- `HAPP_TEL` / `HAPP_PASS` が設定されているか確認（値は表示しない）
- happ-s.com にブラウザから手動でログインできるか確認
- Playwright のブラウザをインストール: `npx playwright install chromium`

### サーバーは起動するがページが返ってこない / 起動が極端に遅い / 3000 と 3001 が混在する

症状: `npm run dev` は "Ready" を表示するが、localhost:3000 が反応しない / HTTP_STATUS:000 になる / ブラウザでページが開かない / 3001 番に逃げてしまう。

**まず `npm run dev:clean` を試す:**

```bash
npm run dev:clean
```

`dev:clean` は以下を自動で行う:
1. ポート 3000 の既存プロセスを停止（通常 kill → 残存なら kill -9）
2. `nohup npm run dev -- -p 3000` でクリーン起動
3. Ready ログをポーリング（最大 10 秒）
4. `curl` で HTTP 200 を確認

> **注意**: `dev:clean` はポート 3000 を使用中のプロセスをすべて停止する。他のプロジェクトで 3000 番を使用している場合はそちらも停止されるため注意すること。

`dev:clean` でも解決しない場合の最終手段:

```bash
# .next キャッシュを削除して再起動（コンパイルに時間がかかる）
rm -rf .next
npm run dev:clean
```

注意:
- `.next/` 削除は毎回行わない。キャッシュが壊れていると判断できる場合のみ
- `.next/` 削除後の初回アクセスは Turbopack の再コンパイルで少し時間がかかることがある
