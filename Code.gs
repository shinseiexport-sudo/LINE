/**
 * ============================================================
 * Code.gs — Webアプリの入口
 * ============================================================
 * ・URLをそのまま開く → 管理画面（Index.html）。オーナーだけが開けます
 * ・URLの末尾に「?page=reserve」を付けた場合 → お客様用の
 *   LIFF予約フォーム（Reserve.html）を表示します
 */

// Webアプリの入口
function doGet(e) {
  // シートが無ければ自動作成する（既存のシート・データは壊しません）
  ensureSheets();

  const page = (e && e.parameter && e.parameter.page) || '';

  // --- お客様用のLIFF予約フォーム ---
  if (page === 'reserve') {
    const t = HtmlService.createTemplateFromFile('Reserve');
    const props = PropertiesService.getScriptProperties();
    t.liffId = props.getProperty(APP.PROP_LIFF_ID) || '';
    // フォームからの送信先（このデプロイ自身のURL）と送信キー
    t.execUrl = ScriptApp.getService().getUrl() || '';
    let reserveKey = props.getProperty(APP.PROP_RESERVE_KEY);
    if (!reserveKey) {
      reserveKey = Utilities.getUuid().replace(/-/g, '');
      props.setProperty(APP.PROP_RESERVE_KEY, reserveKey);
    }
    t.reserveKey = reserveKey;
    // 店舗一覧はサーバー側で埋め込む（LIFF内の追加通信を減らして安定させる）
    const activeStores = listStoresInternal_().filter(function (s) {
      return (str_(s.status) || APP.STORE_STATUS.ACTIVE) === APP.STORE_STATUS.ACTIVE;
    });
    t.storesJson = JSON.stringify(activeStores.map(function (s) {
      return { store_id: s.store_id, store_name: s.store_name };
    }));
    // 店舗が1つだけなら「△△店 ご予約フォーム」のように店名を見出しに入れる（信頼感アップ）
    t.heroTitle = (activeStores.length === 1 ? activeStores[0].store_name + ' ' : '') + 'ご予約フォーム';
    return t.evaluate()
      .setTitle('ご予約')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // --- 管理画面（鍵付きURLだけが開ける） ---
  // GASの仕様上、訪問者の本人確認は確実に行えないため、
  // 「?admin=共有キー」付きのURLだけが管理画面を表示できる仕組みにします。
  // 共有キーは③ LINE接続タブで確認できます（スクリプトプロパティと同じもの）。
  const adminKey = (e && e.parameter && e.parameter.admin) || '';
  const sharedKey = PropertiesService.getScriptProperties().getProperty(APP.PROP_SHARED_KEY) || '';
  if (sharedKey && adminKey === sharedKey) {
    const template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle('店舗LINE運用システム')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // それ以外のURLは無効扱い（管理画面の中身は一切出さない）
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;text-align:center;padding:48px 16px;color:#555;">' +
    '<h2>このURLは無効です</h2>' +
    '<p>ご予約はお店から送られてきたリンクからご利用ください。</p></div>');
}

// HTMLの中から他のHTMLファイル（CSSやJS）を読み込むための関数
// （Index.html 内の <?!= include('Styles'); ?> などで使います）
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * エディタ上で動作確認するための関数です。
 * 使い方: エディタ上部の関数選択で「debugCheck」を選び「実行」。
 * 初回はOAuth承認を求められます。実行ログ（表示 → ログ）を確認してください。
 */
function debugCheck() {
  ensureSheets();
  Logger.log('シート初期化: OK');
  Logger.log('グループ設定: ' + JSON.stringify(getGroupSettings()));
  Logger.log('店舗数: ' + listStores().length);
  Logger.log('LINE状態: ' + JSON.stringify(getLineStatus()));
  Logger.log('顧客数: ' + listCustomers().stats.total);
}
