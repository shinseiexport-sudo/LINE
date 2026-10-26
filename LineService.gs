/**
 * ============================================================
 * LineService.gs — LINE公式アカウント接続（第1段階のタブ③）
 * ============================================================
 * ・チャネルアクセストークンはスクリプトプロパティにのみ保存
 *   （スプレッドシート・画面・ログには一切出力しません）
 * ・接続確認は LINE Messaging API の GET /v2/bot/info を使用します
 *   （参照: https://developers.line.biz/ja/reference/messaging-api/#get-bot-info）
 */

// 画面へ表示する接続状態（トークンの値は絶対に含めない）
function getLineStatus() {
  ensureSheets();
  const sh = getSheet_(APP.SHEETS.LINE);
  const rows = readTable_(sh);
  let row = null;
  rows.forEach(function (r) {
    if (String(r.connection_id) === APP.LINE_CONNECTION_ID) row = r;
  });
  if (!row && rows.length > 0) row = rows[0];

  const tokenRegistered = !!PropertiesService.getScriptProperties().getProperty(APP.PROP_LINE_TOKEN);

  return {
    connection_id: row ? String(row.connection_id) : '',
    channel_id: row ? String(row.channel_id) : '',
    bot_user_id: row ? String(row.bot_user_id) : '',
    connection_status: (row && str_(row.connection_status)) ? String(row.connection_status) : APP.LINE_STATUS.DISCONNECTED,
    last_checked_at: row ? String(row.last_checked_at) : '',
    token_registered: tokenRegistered
  };
}

// 「トークンを保存して接続確認まで行う」（管理画面のボタンはこれ1つ）
function saveLineSettingsAndTest(input) {
  ensureSheets();

  const channelId = require_(input && input.channel_id, 'チャネルID');
  if (!/^\d+$/.test(channelId)) {
    throw new Error('チャネルIDは数字のみで入力してください（LINE Developersコンソールの「Basic settings」にある Channel ID）。');
  }
  const token = require_(input && input.access_token, 'チャネルアクセストークン');
  if (token.length < 30) {
    throw new Error('チャネルアクセストークンが短すぎます。コピー漏れがないか確認してください。');
  }

  // トークンをスクリプトプロパティへ保存（シートには書かない）
  PropertiesService.getScriptProperties().setProperty(APP.PROP_LINE_TOKEN, token);

  // LineSettingsシートには「見せても安全な情報だけ」を記録する
  const sh = getSheet_(APP.SHEETS.LINE);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rows = readTable_(sh);
    const row = rows.filter(function (r) {
      return String(r.connection_id) === APP.LINE_CONNECTION_ID;
    })[0];
    if (row) {
      sh.getRange(row._row, 2, 1, 4).setValues([[channelId, '', APP.LINE_STATUS.DISCONNECTED, '']]);
    } else {
      sh.appendRow([APP.LINE_CONNECTION_ID, channelId, '', APP.LINE_STATUS.DISCONNECTED, '']);
    }
  } finally {
    lock.releaseLock();
  }

  // 保存が済んだので、そのまま接続確認まで行う
  return testLineConnection();
}

// LINE APIで接続確認する（既に保存済みのトークンを使用）
function testLineConnection() {
  ensureSheets();

  const token = PropertiesService.getScriptProperties().getProperty(APP.PROP_LINE_TOKEN);
  if (!token) {
    return {
      ok: false,
      status: getLineStatus(),
      message: 'チャネルアクセストークンが未登録です。下のフォームでトークンを保存してください。'
    };
  }

  let response;
  try {
    response = UrlFetchApp.fetch(APP.LINE_API_BASE + '/v2/bot/info', {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
  } catch (err) {
    return {
      ok: false,
      status: getLineStatus(),
      message: 'LINE APIへ接続できませんでした。ネットワークやGASの設定を確認してください。（' + err.message + '）'
    };
  }

  const code = response.getResponseCode();
  const bodyText = response.getContentText();
  const checkedAt = nowStr_();

  // --- 成功 ---
  if (code === 200) {
    let info = {};
    try { info = JSON.parse(bodyText); } catch (e) { info = {}; }
    updateLineRow_({
      bot_user_id: info.userId ? String(info.userId) : '',
      connection_status: APP.LINE_STATUS.CONNECTED,
      last_checked_at: checkedAt
    });
    return {
      ok: true,
      message: '接続に成功しました。',
      bot: {
        display_name: info.displayName ? String(info.displayName) : '',
        basic_id: info.basicId ? String(info.basicId) : '',
        bot_user_id: info.userId ? String(info.userId) : ''
      },
      status: getLineStatus()
    };
  }

  // --- 失敗 ---
  updateLineRow_({ connection_status: APP.LINE_STATUS.ERROR, last_checked_at: checkedAt });

  if (code === 401) {
    return {
      ok: false,
      status: getLineStatus(),
      message: 'トークンが無効です（HTTP 401）。LINE Developersコンソールで「チャネルアクセストークン（長期）」を再発行し、新しいトークンで保存し直してください。（再発行すると古い長期トークンは自動的に無効になります）'
    };
  }
  return {
    ok: false,
    status: getLineStatus(),
    message: 'LINE APIがエラーを返しました（HTTP ' + code + '）。しばらく待ってから「接続を再確認」を押してください。'
  };
}

// トークンを削除して初期状態へ戻す（再設定用）
function disconnectLine() {
  ensureSheets();

  PropertiesService.getScriptProperties().deleteProperty(APP.PROP_LINE_TOKEN);

  const sh = getSheet_(APP.SHEETS.LINE);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rows = readTable_(sh);
    const row = rows.filter(function (r) {
      return String(r.connection_id) === APP.LINE_CONNECTION_ID;
    })[0];
    if (row) {
      sh.getRange(row._row, 2, 1, 4).setValues([['', '', APP.LINE_STATUS.DISCONNECTED, '']]);
    }
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    message: 'LINE接続を解除しました。再接続するには新しいトークンを保存してください。',
    status: getLineStatus()
  };
}

// LineSettingsの1行を更新する（channel_idは上書きしない）
function updateLineRow_(values) {
  const sh = getSheet_(APP.SHEETS.LINE);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rows = readTable_(sh);
    let row = rows.filter(function (r) {
      return String(r.connection_id) === APP.LINE_CONNECTION_ID;
    })[0];
    if (!row) {
      sh.appendRow([APP.LINE_CONNECTION_ID, '', '', APP.LINE_STATUS.DISCONNECTED, '']);
      row = { _row: sh.getLastRow() };
    }
    if (values.bot_user_id !== undefined) sh.getRange(row._row, 3).setValue(values.bot_user_id);
    if (values.connection_status !== undefined) sh.getRange(row._row, 4).setValue(values.connection_status);
    if (values.last_checked_at !== undefined) sh.getRange(row._row, 5).setValue(values.last_checked_at);
  } finally {
    lock.releaseLock();
  }
}
