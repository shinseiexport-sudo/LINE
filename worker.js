/**
 * ============================================================
 * 店舗LINE運用システム — LINE Webhook中継 Worker
 * （Cloudflare Workers 用）
 * ============================================================
 * 役割:
 *   1. LINEからのPOSTの署名（x-line-signature）を検証する
 *   2. 正しいものだけに「共有キー」を付けてGASへ転送する
 * LINE → このWorker → GAS doPost の順に流れます。
 *
 * 設定する変数（Workersの Settings → Variables and Secrets）:
 *   CHANNEL_SECRET  … LINE Developersコンソール「基本設定」のチャネルシークレット
 *   GAS_WEBHOOK_URL … Webhook用デプロイ（全員アクセス）のGAS WebアプリURL
 *   GAS_SHARED_KEY  … 管理画面③タブに表示される共有キー
 *
 * ログの見方（Workerの「Logs」→「Begin log stream」で表示）:
 *   - ログ自体が出ない        → LINE→Worker に届いていない（Webhook URL/Webhook利用を確認）
 *   - signature check=NG      → CHANNEL_SECRET が違う
 *   - GAS finalUrl=accounts…  → GAS_WEBHOOK_URL が管理画面用（自分のみ）のまま → C-2.5をやり直す
 *   - GAS said=forbidden      → GAS_SHARED_KEY が不一致
 *   - GAS said=ok             → GASまで正常に届いている
 */

export default {
  async fetch(request, env) {
    console.log('worker: request received, method=' + request.method);

    if (!env.CHANNEL_SECRET || !env.GAS_WEBHOOK_URL || !env.GAS_SHARED_KEY) {
      console.log('worker: 変数未設定あり CHANNEL_SECRET=' + (env.CHANNEL_SECRET ? 'OK' : 'なし')
        + ' GAS_WEBHOOK_URL=' + (env.GAS_WEBHOOK_URL ? 'OK' : 'なし')
        + ' GAS_SHARED_KEY=' + (env.GAS_SHARED_KEY ? 'OK' : 'なし'));
    }

    // GETなどは「生きている確認」としてOKを返す（LINEの検証ボタン用）
    if (request.method !== 'POST') {
      return new Response('ok');
    }

    const body = await request.text();
    const signature = request.headers.get('x-line-signature');
    console.log('worker: signature header=' + (signature ? 'あり' : 'なし')
      + ' configured secret length=' + (env.CHANNEL_SECRET ? env.CHANNEL_SECRET.length : 0) + ' (expect 32)');
    if (!signature) {
      return new Response('missing signature', { status: 400 });
    }

    const valid = await verifySignature_(body, signature, env.CHANNEL_SECRET);
    console.log('worker: signature check=' + (valid ? 'OK' : 'NG'));
    if (!valid) {
      return new Response('invalid signature', { status: 403 });
    }

    // GASへは「共有キー付き」で転送する
    // （GASのURLを知っているだけでは偽データを送れないようにする対策）
    try {
      const gasRes = await fetch(env.GAS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: env.GAS_SHARED_KEY, payload: body })
      });
      // リダイレクト先まで含めて記録（ログイン画面に飛ばされたら finalUrl で分かる）
      const gasText = await gasRes.text();
      console.log('worker: GAS status=' + gasRes.status
        + ' finalUrl=' + (gasRes.url || '?')
        + ' GAS said=' + gasText.substring(0, 20));
    } catch (err) {
      console.log('worker: GAS forward failed=' + (err && err.message ? err.message : String(err)));
      // GAS側が一時的に失敗しても、LINEへの応答は成功にする（リトライ暴発を防ぐ）
    }

    // LINEにはGASの処理結果を待たずに即OKを返す（タイムアウト防止）
    return new Response('ok');
  }
};

// 署名検証: チャネルシークレットでHMAC-SHA256を作り、x-line-signatureと比較する
// （参照: https://developers.line.biz/ja/docs/messaging-api/verify-webhook-signature/）
async function verifySignature_(body, signature, channelSecret) {
  if (!channelSecret || !signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  // LINEのX-Line-Signatureは「Base64エンコード」した値 → 16進数ではなくBase64で比較する
  const bytes = new Uint8Array(mac);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const expected = btoa(binary);
  return expected === signature;
}
