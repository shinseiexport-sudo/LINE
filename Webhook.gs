/**
 * ============================================================
 * Webhook.gs — LINEからのイベント受信（第2段階）
 * ============================================================
 * 構成:
 *   LINE → Cloudflare Worker（署名検証）→ GAS doPost
 * GAS単独ではリクエストヘッダーを読めず署名検証ができないため、
 * 検証済みのイベントだけをWorkerが転送してきます。
 * さらにWorkerは「共有キー」を付けて転送するので、
 * GASのURLを知っているだけでは偽データを送れません。
 */

// LINE(Worker経由)からのイベントを受け取る
function doPost(e) {
  // LIFF予約フォーム（Reserve.html）からの直接送信（?api=reserve のときだけAPIとして受ける）
  if (e && e.parameter && e.parameter.api === 'reserve' && e.postData && e.postData.contents) {
    return apiReserve_(e);
  }
  try {
    if (!e || !e.postData || !e.postData.contents) return textResponse_('bad request');

    const req = JSON.parse(e.postData.contents);
    const sharedKey = PropertiesService.getScriptProperties().getProperty(APP.PROP_SHARED_KEY);
    if (!sharedKey || req.key !== sharedKey) return textResponse_('forbidden');

    // 転送されたLINEのイベント本体
    const linePayload = JSON.parse(req.payload);
    (linePayload.events || []).forEach(handleEvent_);

    return textResponse_('ok');
  } catch (err) {
    // 失敗してもLINEには200を返す（LINEがリトライを繰り返すのを防ぐため）
    // エラー内容はログで確認（トークンなどの秘密情報はログに出さない）
    try { Logger.log('webhook error: ' + (err && err.message ? err.message : err)); } catch (ignored) {}
    return textResponse_('ok');
  }
}

function textResponse_(text) {
  return ContentService.createTextOutput(text);
}

/**
 * LIFF予約フォームからの直接送信を受け付ける。
 * LINE署名は無い代わりに、フォームに埋め込んだ予約用キー（RESERVE_API_KEY）で検証する。
 */
function apiReserve_(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty(APP.PROP_RESERVE_KEY);
    if (!expected || req.key !== expected) {
      out = { ok: false, message: '送信キーが一致しません。フォームを開き直してください。' };
    } else {
      const res = createReservationByCustomer({
        lineUserId: req.lineUserId,
        lineName: req.lineName,
        store_id: req.store_id,
        date: req.date,
        time: req.time,
        party_size: req.party_size,
        customer_name: req.customer_name,
        phone: req.phone,
        notes: req.notes
      });
      out = { ok: true, reservation_id: res.reservation_id };
    }
  } catch (err) {
    out = { ok: false, message: err && err.message ? err.message : '送信に失敗しました。' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// 1件のイベントを処理する
function handleEvent_(ev) {
  if (!ev || !ev.source || ev.source.type !== 'user' || !ev.source.userId) return;
  const lineUserId = String(ev.source.userId);

  if (ev.type === 'follow') {
    // 友だち追加 → 顧客台帳へ自動登録（登録済みなら最新化）
    registerCustomer_(lineUserId);
  } else if (ev.type === 'unfollow') {
    // 友だち解除 → 状態だけ変更（顧客履歴は削除しない方針）
    setFriendStatus_(lineUserId, APP.FRIEND_STATUS.UNFOLLOWED);
  } else if (ev.type === 'message') {
    // メッセージ受信 → 最終反応日時だけ更新（本文は保存しない：個人情報を最小限にする方針）
    touchLastInteraction_(lineUserId);
  }
}

// ③タブの「Webhook連携」カードに表示する情報
// （管理画面を「自分のみ」公開で運用している前提の表示です）
function getWebhookSetupInfo() {
  ensureSheets();
  const props = PropertiesService.getScriptProperties();
  return {
    gas_web_app_url: ScriptApp.getService().getUrl() || '',
    shared_key: props.getProperty(APP.PROP_SHARED_KEY) || ''
  };
}
