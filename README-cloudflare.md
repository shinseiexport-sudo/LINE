# Cloudflare Workers の設定手順（第2段階）

LINEからのイベント（友だち追加・メッセージなど）を安全に受けるため、
署名検証を行う「Worker」を1つ作成します。無料で・カード登録なしで・10分ほどで終わります。

## 用語の整理

- **Cloudflare Worker** … 小さなプログラムを無料で常時動かせるサービス。ここでは「LINEのイベントを検証してGASへ中継する門番」の役割
- **チャネルシークレット** … 署名検証に使う文字列。LINE Developersコンソールの「基本設定」タブに表示されます（チャネルアクセストークンとは別物です）
- **共有キー** … Worker→GAS転送時に付ける合言葉。管理画面③タブに表示されます

## 手順C-1: Cloudflareアカウントを作る

1. https://dash.cloudflare.com/sign-up を開き、メールアドレスで無料登録（クレジットカード不要）
2. ログインするとダッシュボードが表示されます

## 手順C-2: Workerを作る

※2026年のダッシュボード刷新で、左メニューに「Workers & Pages」が直接表示されなくなりました。「Build」セクションの「Compute」の中に移動しています。

1. 左サイドバーの「Build」セクションにある **「Compute」** をクリック（添付画像で「Observability」の下あたりにある項目です）
2. 表示される一覧から **「Workers」** をクリック
3. 画面右上あたりの **「Create application」**（表示によっては「Create」）ボタンを押す
4. **「Create Worker」**（「Hello World」テンプレートでOK）を選び、名前を入力（例: `line-webhook-sakura`）→「Deploy」
   - メニューが見つからない場合は、左上の検索バー（`Ctrl + K`）に「Workers」と入力して移動するのが確実です
5. Workerの詳細画面を開き、右上の **「Edit code」** ボタンを押す（表示環境によっては「Quick edit」という名前の場合もあります。作成直後にコードエディタが開いた場合は、このステップは不要）
6. エディタに最初からあるコードを全て消す（エディタ内をクリック → `Ctrl + A` → `Delete`）→ 配布の `worker.js` の中身をすべて貼り付ける
7. 右上の「Deploy」を押して保存する
8. Workersの一覧から今のWorkerを開き、表示されているURL（例: `https://line-webhook-sakura.自分のアカウント.workers.dev`）をメモする
   - これが「Webhook URL」になります（LINEに登録するのはGASのURLではなく、このURLです）
   - Worker一覧のページが見つからない場合は、 https://dash.cloudflare.com/?to=/:account/workers-and-pages を開くと直接移動できます

## 手順C-2.5: GASに「Webhook用」のデプロイをもう1つ作る（重要）

Webhookは、CloudflareのWorkerからGASへPOSTされます。管理画面用のデプロイは「自分のみ」アクセスのため、Workerからの送信がGoogleに拒否されてしまいます。そこで、**同じGASプロジェクトに「全員」アクセスのデプロイをもう1つ作ります**（コードの変更は不要です）。

1. GASエディタ右上の「デプロイ」→「新しいデプロイ」
2. 歯車アイコン →「ウェブアプリ」を選び、次のように設定:
   - 説明: Webhook用
   - 実行ユーザー: 自分
   - アクセスできるユーザー: **全員** ← 管理画面用とここだけが違う
3. 「デプロイ」→ 表示された「ウェブアプリ」のURL（`…/exec` で終わる）をコピー
   - このURLをCloudflareの `GAS_WEBHOOK_URL` に登録します（**管理画面のURLとは別物です**）
   - このURLは外部に公開しないでください（Workerが使う専用のURLです）

※注意: あとでコードを更新したときは、**管理画面用・Webhook用の両方のデプロイ**を「新しいバージョン」に更新してください（「デプロイを管理」から編集）。

## 手順C-3: 3つの変数を登録する

1. Workerの「Settings」→「Variables and Secrets」→「Add」を3回繰り返す
2. 次の3つを追加する（TypeはSecret（暗号化）でOK）

| 変数名 | 入れる値 | 値の入手場所 |
|---|---|---|
| `CHANNEL_SECRET` | チャネルシークレット（32桁くらいの英数字） | LINE Developersコンソール → 対象チャネル →「基本設定」タブ →「チャネルシークレット」 |
| `GAS_WEBHOOK_URL` | GAS WebアプリのURL（`https://script.google.com/macros/s/…/exec`） | **手順C-2.5で作った「Webhook用デプロイ」のURL**（管理画面用のURLではありません） |
| `GAS_SHARED_KEY` | 共有キー（長い英数字） | 管理画面「③ LINE接続」タブ「Webhook連携」カードの「共有キー」（「コピー」ボタンでコピー） |

3. 保存すると自動的に再デプロイされます

## 手順C-4: LINE DevelopersコンソールにWebhook URLを登録する

1. LINE Developersコンソール（https://developers.line.biz/console/ ）→ 対象のMessaging APIチャネル →「Messaging API設定」タブ
2. 「Webhook設定」の中の「Webhook URL」に、手順C-2でメモしたWorkerのURLを貼り付けて「更新」
3. 「Webhook利用」をONにする
4. 「検証」ボタンを押して「成功」と出ればOK
   - 「失敗」になる場合は、URLの貼り間違い・変数名の打ち間違いを確認してください

## 手順C-5: 動作確認する

1. スマホのLINEで、あなたのLINE公式アカウントを友だち追加する（またはブロック解除する）
2. 管理画面の「④ 顧客台帳」タブを開く → 顧客が1行追加されていれば成功
3. すでに友だちが多数いる場合は「既存の友だちを取り込む」ボタンで一括登録できます

### ログの見方（途中で止まったときの切り分け）

1. Workerの詳細画面 → 上部タブ「**Observability**」（旧名「Logs」）をクリック
2. 「**Begin log stream**」ボタンを押す → ログ待ち受け状態になる
3. そのままLINEの「検証」を押すか、友だち追加をすると `worker: …` のログが流れる
4. 読み方の詳細は `worker.js` の冒頭コメントにまとめてあります
   - ログが何も流れない → LINE→Workerに届いていない（Webhook URL・「Webhook利用」を確認）
   - `signature check=NG` → CHANNEL_SECRETが違う
   - `GAS finalUrl=accounts…` → GAS_WEBHOOK_URLが管理画面用のまま（手順C-2.5をやり直す）
   - `GAS said=forbidden` → GAS_SHARED_KEYが不一致

## うまくいかないとき

| 症状 | 対処 |
|---|---|
| 「検証」で失敗する | WorkerのURLをそのまま貼れているか（末尾の余分な空白なしで）。Workerが「Deploy」済みか。ブラウザでWorkerのURLを開いて「ok」と表示されるか |
| 友だち追加しても顧客が増えない | ①GASに「Webhook用デプロイ（全員アクセス）」を作り、`GAS_WEBHOOK_URL` にそのURLを登録したか（手順C-2.5）②LINE側で「Webhook利用」がONか ③変数3つの名前が正確か（大文字・`_`も正確に） ④「④ 顧客台帳」タブを開き直す（表示は開いた時点のものです） |
| GASの実行数に doPost の記録がない | リクエストがGASに届いていません。`GAS_WEBHOOK_URL` がWebhook用デプロイのURLか、LINEの「Webhook利用」がONかを確認 |
| GASの実行数に doPost の記録はあるが顧客が増えない | `GAS_SHARED_KEY` が管理画面の共有キーと一致していない可能性（`forbidden`）。一致させたら変数を保存 |
| `invalid signature` が出る | `CHANNEL_SECRET` の値が違います。トークンではなく「チャネルシークレット」を入れているか確認 |
| `forbidden` が出る | `GAS_SHARED_KEY` が管理画面の共有キーと一致していません |

## セキュリティのメモ

- チャネルシークレット・共有キーはWorkerのSecretsとして保存され、画面には再表示されません（誤って登録した場合は削除して作り直せます）
- チャネルアクセストークンはCloudflare側には保存しません（GASのスクリプトプロパティのみ）
- Workerは署名検証を通ったLINEからのリクエストだけをGASへ渡します
