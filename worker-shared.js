/**
 * ============================================================
 * 店舗LINE運用システム — 共有Webhook中継 Worker（マルチテナント / フェーズ2.5）
 * ============================================================
 * 1個のWorkerで複数の飲食店グループをさばきます。
 *
 * LINEのWebhookに登録するURLの形:
 *   https://<このWorkerのURL>/t/<グループコード>
 *   例: https://line-webhook-shared.yuckydesign.workers.dev/t/test01
 *   （グループコードは半角英数と - _ だけの好きな名前。KVの名簿の行と一致させる）
 *
 * KV（名簿）の作り方:
 *   1) CloudflareでKVネームスペースを作り、このWorkerに
 *      変数名「TENANTS」でバインドする（手順はREADME-shared-cloudflare.md）
 *   2) 名簿に1行追加する:
 *      キー: tenant:<グループコード>
 *      値(JSON): {
 *        "name":   "ラベル（自由記入。ログ表示用）",
 *        "secret": "LINEチャネルシークレット",
 *        "gasUrl": "Webhook用GASデプロイのURL（…/exec）",
 *        "key":    "そのGASのスクリプトプロパティ WEBHOOK_SHARED_KEY の値"
 *      }
 *
 * ログの見方（Observability → Begin log stream）:
 *   - tenant=… （名前付き）   → 名簿が引けている
 *   - tenant not found        → パスのコード違い or 名簿行なし（404を返す）
 *   - signature check=OK      → その店のシークレットで署名一致
 *   - GAS said=ok             → GASまで正常に届いた
 *   - GAS said=forbidden      → 名簿の key とGASの WEBHOOK_SHARED_KEY が不一致
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log('worker: request received, method=' + request.method + ' path=' + url.pathname);

    // GETなどは生存確認としてOKを返す（LINEの検証ボタンやブラウザ確認用）
    if (request.method !== 'POST') {
      return new Response('ok');
    }

    // /t/<グループコード> 形式だけを受け付ける
    const m = url.pathname.match(/^\/t\/([A-Za-z0-9_-]+)\/?$/);
    if (!m) {
      console.log('worker: bad path (expect /t/<グループコード>)');
      return new Response('not found', { status: 404 });
    }
    const groupCode = m[1];

    if (!env.TENANTS) {
      console.log('worker: KV binding TENANTS missing (README C-3を確認)');
      return new Response('not configured', { status: 500 });
    }

    // 名簿からその店の行を引く
    const row = await env.TENANTS.get('tenant:' + groupCode, 'json');
    if (!row || !row.secret || !row.gasUrl || !row.key) {
      console.log('worker: tenant not found or incomplete row: ' + groupCode);
      return new Response('not found', { status: 404 });
    }
    console.log('worker: tenant=' + groupCode + ' (' + (row.name || 'ラベル未設定') + ')');

    const body = await request.text();
    const signature = request.headers.get('x-line-signature');
    console.log('worker: signature header=' + (signature ? 'あり' : 'なし')
      + ' configured secret length=' + (row.secret ? row.secret.length : 0) + ' (expect 32)');
    if (!signature) {
      return new Response('missing signature', { status: 400 });
    }

    // LINEの署名を「その店の」シークレットで検証する
    const valid = await verifySignature_(body, signature, row.secret);
    console.log('worker: signature check=' + (valid ? 'OK' : 'NG'));
    if (!valid) {
      return new Response('invalid signature', { status: 403 });
    }

    // GASへは「その店の」共有キーを付けて転送する
    try {
      const gasRes = await fetch(row.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: row.key, payload: body })
      });
      const gasText = await gasRes.text();
      console.log('worker: GAS status=' + gasRes.status
        + ' finalUrl=' + (gasRes.url || '?')
        + ' GAS said=' + gasText.substring(0, 20));
    } catch (err) {
      console.log('worker: GAS forward failed=' + (err && err.message ? err.message : String(err)));
      // GAS側が一時的に失敗してもLINEへの応答は成功にする（リトライ暴発を防ぐ）
    }

    return new Response('ok');
  }
};

// 署名検証: チャネルシークレットでHMAC-SHA256を作り、x-line-signatureと比較する
// LINEのX-Line-SignatureはBase64エンコードなので、Base64で比較する（参照:
// https://developers.line.biz/ja/docs/messaging-api/verify-webhook-signature/）
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
  const bytes = new Uint8Array(mac);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const expected = btoa(binary);
  return expected === signature;
}
