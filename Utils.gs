/**
 * ============================================================
 * Utils.gs — 共通の小さな関数
 * ============================================================
 * 名前が「_」で終わる関数は画面（クライアント）からは呼べません。
 * 画面から呼ぶ関数はサービスファイル（GroupService など）に置きます。
 */

// 現在日時を「yyyy-MM-dd HH:mm:ss」（グループ共通タイムゾーン）の文字列で返す
function nowStr_() {
  return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss');
}

// 指定した名前のシートを取得する（無ければエラー）
function getSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) {
    throw new Error('シート「' + name + '」が見つかりません。スプレッドシートから「拡張機能 → Apps Script」で開いたプロジェクトか確認してください。');
  }
  return sh;
}

// 必須入力のチェック（空なら日本語エラーを投げる）
function require_(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(label + 'を入力してください。');
  }
  return String(value).trim();
}

// 値を安全な文字列にする（空欄は空文字）
function str_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// シートの中身を「オブジェクト配列」にして返す（_row = 実際の行番号）
function readTable_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, i) {
    const obj = { _row: i + 2 };
    headers.forEach(function (h, c) { obj[h] = row[c] === null || row[c] === undefined ? '' : row[c]; });
    return obj;
  });
}

// 管理者（オーナー）のメールアドレスをGroupSettingsから取得する（無ければ空文字）
function getOwnerEmail_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.SHEETS.GROUP);
  if (!sh) return '';
  let email = '';
  readTable_(sh).forEach(function (r) {
    if (String(r.setting_key) === 'admin_email') email = String(r.setting_value);
  });
  return email.trim();
}
