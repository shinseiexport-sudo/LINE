# 共有Worker（マルチテナント）導入手順 — Cloudflare

1個のWorkerで全飲食店グループのWebhookをさばく構成にする手順です。
**この作業は1回だけ。** 2店目以降は「名簿（KV）に1行追加」だけで済みます。

---

## 全体像

```
LINE → 【共有Worker 1個】 → /t/<グループコード> で判別
                              ├─ KV名簿「tenant:test01」の行を参照
                              ├─ その店のシークレットで署名検証
                              └─ その店のGASへ共有キー付きで転送
```

名簿（KV）の1行の内容:

| 項目 | 何の値？ | どこで取るか |
|---|---|---|
| キー `tenant:<グループコード>` | 好きな半角英数の名前（例: `test01`） | 自分で決める |
| `name` | ラベル（ログ表示用） | 自分で決める |
| `secret` | チャネルシークレット | LINE Developers → 基本設定（**コピーアイコンを使う。「発行」は押さない**） |
| `gasUrl` | Webhook用GASデプロイのURL（…/exec） | 管理画面「③ Messaging API設定」の「Webhook連携」カード |
| `key` | そのGASの `WEBHOOK_SHARED_KEY`（スクリプトプロパティ） | 同じく「Webhook連携」カードに表示 |

---

## C-1. KVネームスペースを作る（1回だけ）

1. Cloudflareダッシュボード → 左メニュー **Storage & Databases → Workers KV**
   （注意: KVはWorkers & Pagesの中からは移動済み。ここで見つからなければ左メニューの検索ボックスで「KV」）
2. **Create instance**（表記が Create a namespace の場合あり）→ 名前: `line-tenants` → 作成

## C-2. Workerを用意する（2択。**Aが最短・おすすめ**）

**A. 既存の restless-cherry-9265yuckydesign を流用する（新しいWorkerは作らない）**

1. 左メニュー **Build → Compute（Workers & Pages）** → 一覧から `restless-cherry-9265yuckydesign` を開く
2. 右上 **Edit code** → 既存コードを全選択→削除 → `worker-shared.js` の中身を貼り付け → **Deploy**
3. 使っていた旧変数（CHANNEL_SECRET / GAS_WEBHOOK_URL / GAS_SHARED_KEY）は未使用になるが、そのまま放置でOK
4. 以降は C-3 へ。LINEのWebhook URLも `https://restless-cherry-9265yuckydesign.yuckydesign.workers.dev/t/test01` の形になる（C-5）

**B. 新しいWorkerを作る場合**

1. 左メニュー **Build → Compute（Workers & Pages）** → **一覧ページを開く**（個別のWorkerページではなく）
2. 画面**右上の Create application** → **Create Worker** → Hello World のまま **Deploy**
3. **Edit code** → 初期コードを全消去 → `worker-shared.js` を貼り付け → **Deploy**
4. Deployed version のハッシュが変わったことを確認

## C-3. 名簿（KV）をWorkerに結び付ける（1回だけ）

1. Workerの **Settings → Bindings（変数）** → **Add → KV Namespace**
2. 変数名: `TENANTS`（**この名前ぴったり**。worker-shared.jsがこの名前で参照します）
3. ネームスペース: `line-tenants` を選択 → **Save and deploy**
4. Deployed version のハッシュが変わったことを確認

## C-4. 名簿に店を1行追加する（**店を増やすたびに、これだけ**）

1. **Build → Compute → Workers & Pages → KV** → `line-tenants` を開く
2. **Add key/value**（JSONモードがあれば使う）:
   - Key: `tenant:test01`（← グループコードは好きに決める）
   - Value（JSON、そのまま貼り付けられる形）:

```json
{
  "name": "yuckydesign test",
  "secret": "<LINE Developersに表示中のチャネルシークレット>",
  "gasUrl": "<管理画面③の Webhook用GAS URL（/exec で終わる）>",
  "key": "<管理画面③の WEBHOOK_SHARED_KEY>"
}
```

3. 保存。**値は必ず `"` で囲まれた文字列にする**（数値扱いや空白混入がNG）

## C-5. LINEにWebhook URLを登録する

1. LINE Developers → Messaging API設定 → Webhook URL:
   `https://<C-2のWorkerのURL>/t/<グループコード>`
   例: `https://line-webhook-shared.yuckydesign.workers.dev/t/test01`
2. **「検証」** → 成功が出ればOK
3. Observability → Begin log stream で確認:
   `tenant=test01 (...)` → `signature check=OK` → `GAS said=ok`

## C-6. 既存の restless-cherry からの切り替え（今回だけ）

1. 上の手順で `tenant:test01` を登録 → LINEのWebhook URLを新しい共有WorkerのURLに変えて「検証」
2. 友だち追加テスト（ブロック→解除）→ ④顧客台帳に反映されれば移行完了
3. 旧Worker `restless-cherry-9265yuckydesign` は1〜2週間そのまま置き、問題なければ削除

## C-7. 2店目以降の追加フロー（覚え書き）

1. スプレッドシートを複製 → GASコード貼り付け → 2デプロイ（管理画面用「自分のみ」/ Webhook用「全員」）
2. スクリプトプロパティ `LINE_CHANNEL_ACCESS_TOKEN` を設定（Bootstrapが `WEBHOOK_SHARED_KEY` を自動生成）
3. **C-4のKV行を1行追加**
4. LINE Developers（その店のチャネル）→ Webhook URL に `…/t/<新しいコード>` を登録 → 検証

---

## トラブルシュート

| 症状（ログ/画面） | 原因 | 対処 |
|---|---|---|
| `404 not found`、ログに `tenant not found` | パスのコードとKVのキーが不一致 / KV行が未登録 | コードの大文字小文字・`tenant:` 接頭辞を確認 |
| ログに `KV binding TENANTS missing` | バインド未設定 or 変数名が違う | C-3をやり直す（名前は `TENANTS`） |
| `signature check=NG` | 名簿の `secret` がその店の現行値と違う | LINE Developersの表示値をコピーアイコンで再取得 |
| `GAS said=forbidden` | 名簿の `key` がGASの `WEBHOOK_SHARED_KEY` と不一致 | 管理画面③の表示値でKVの行を更新 |
| `GAS finalUrl=accounts.google…` | `gasUrl` が管理画面用（自分のみ）デプロイになっている | Webhook用（全員）の `/exec` URLを入れる |
| 検証で403、ログの `configured secret length=` が32以外 | secretに余計な空白/切れ落ち | KVの行を編集し直す |

## 使用量メモ

- リクエストはLINEのイベント数ぶん（無料枠10万件/日）。KV読み取りが1イベント+1回（無料枠10万回/日）。
- Workerの個数やKV行の数は使用量に影響しない。
