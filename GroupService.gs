/**
 * ============================================================
 * GroupService.gs — グループ設定（第1段階のタブ①）
 * ============================================================
 * GroupSettings シートへの読み書きを担当します。
 * 画面から呼べるのは getGroupSettings / saveGroupSettings の2つです。
 */

// クライアントへ現在の設定を返す
function getGroupSettings() {
  ensureSheets();
  const sh = getSheet_(APP.SHEETS.GROUP);
  const rows = readTable_(sh);
  const out = {};
  rows.forEach(function (r) {
    if (r.setting_key) out[String(r.setting_key)] = String(r.setting_value);
  });
  return out;
}

// 画面からの保存（グループ名・管理者メールアドレス・タイムゾーン）
function saveGroupSettings(input) {
  ensureSheets();

  const groupName = require_(input && input.group_name, 'グループ名');
  const adminEmail = require_(input && input.admin_email, '管理者メールアドレス');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('管理者メールアドレスの形式が正しくありません。例: admin@example.com');
  }
  const timezone = str_(input && input.timezone) || APP.TZ;

  const sh = getSheet_(APP.SHEETS.GROUP);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    upsertSetting_(sh, 'group_name', groupName);
    upsertSetting_(sh, 'admin_email', adminEmail);
    upsertSetting_(sh, 'timezone', timezone);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, message: 'グループ設定を保存しました。', settings: getGroupSettings() };
}

// setting_key の行があれば更新、無ければ追記する
function upsertSetting_(sh, key, value) {
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) {
        sh.getRange(i + 2, 2).setValue(value);
        sh.getRange(i + 2, 3).setValue(nowStr_());
        return;
      }
    }
  }
  sh.appendRow([key, value, nowStr_()]);
}
