/**
 * ============================================================
 * Bootstrap.gs — シートの初期化（自動作成）
 * ============================================================
 * doGet のたびに呼ばれますが、既存のシートや設定値は上書きしません。
 */

// 9枚のシートが無ければ作成する。すでにあれば何もしない
function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const existing = {};
    ss.getSheets().forEach(function (s) { existing[s.getName()] = true; });

    Object.keys(APP.HEADERS).forEach(function (name) {
      if (existing[name]) return;
      const sheet = ss.insertSheet(name);
      const headers = APP.HEADERS[name];
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold').setBackground('#1f2430').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    });

    applyTextFormats_(ss);          // 先頭ゼロを保つ列の書式設定
    ensureDefaultGroupSettings_(ss);
    ensureDefaultProperties_();     // スクリプトプロパティの既定値
  } finally {
    lock.releaseLock();
  }
}

// 電話番号などの列を「文字列」扱いにして、先頭の0や日時の書式が勝手に変わらないようにする
function applyTextFormats_(ss) {
  const stores = ss.getSheetByName(APP.SHEETS.STORES);
  if (stores) stores.getRange('D:D').setNumberFormat('@'); // Stores: phone列
  const customers = ss.getSheetByName(APP.SHEETS.CUSTOMERS);
  if (customers) {
    customers.getRange('D:D').setNumberFormat('@'); // Customers: joined_at
    customers.getRange('F:F').setNumberFormat('@'); // Customers: last_interaction_at
    customers.getRange('H:I').setNumberFormat('@'); // Customers: created_at / updated_at
  }
  const reservations = ss.getSheetByName(APP.SHEETS.RESERVATIONS);
  if (reservations) {
    reservations.getRange('D:D').setNumberFormat('@'); // Reservations: 予約日時列（文字列で保存して並べ替えを安定させる）
    reservations.getRange('G:G').setNumberFormat('@'); // Reservations: phone列
    reservations.getRange('K:L').setNumberFormat('@'); // Reservations: created_at / updated_at
  }
}

// GroupSettings の既定キー（group_id など）を、無い場合だけ追記する
function ensureDefaultGroupSettings_(ss) {
  const sh = ss.getSheetByName(APP.SHEETS.GROUP);
  if (!sh) return;

  const defaults = {
    group_id: 'G' + Utilities.getUuid().replace(/-/g, '').substring(0, 12),
    group_name: '',
    admin_email: Session.getActiveUser().getEmail() || '',
    timezone: APP.TZ,
    system_version: APP.VERSION
  };

  const lastRow = sh.getLastRow();
  const values = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  const existingKeys = {};
  values.forEach(function (row) { if (row[0]) existingKeys[String(row[0])] = true; });

  const rows = [];
  Object.keys(defaults).forEach(function (key) {
    if (!existingKeys[key]) rows.push([key, defaults[key], nowStr_()]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  }
}

// スクリプトプロパティの既定値（無い場合だけ作る）
function ensureDefaultProperties_() {
  const props = PropertiesService.getScriptProperties();
  // Worker→GAS転送の共有キー（自動生成・画面③タブで確認できる）
  if (!props.getProperty(APP.PROP_SHARED_KEY)) {
    props.setProperty(APP.PROP_SHARED_KEY, Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
}
