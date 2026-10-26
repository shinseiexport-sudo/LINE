/**
 * ============================================================
 * StoreService.gs — 店舗管理（第1段階のタブ②）
 * ============================================================
 * Stores シートへの読み書きを担当します。
 * 店舗は「削除」ではなく「利用停止（status = suspended）」にします。
 * （将来の予約・来店履歴がブレなくなるため）
 */

// クライアントへ店舗一覧を返す
function listStores() {
  ensureSheets();
  return listStoresInternal_();
}

// saveStore / setStoreStatus の戻り値用（ensureSheetsなし・ロックも取らない）
function listStoresInternal_() {
  const rows = readTable_(getSheet_(APP.SHEETS.STORES));
  const stores = rows
    .filter(function (r) { return str_(r.store_id) !== ''; })
    .map(toStoreObj_);
  stores.sort(function (a, b) { return a.store_id < b.store_id ? -1 : 1; });
  return stores;
}

// 1行を画面用のオブジェクトに変換する
function toStoreObj_(row) {
  return {
    store_id: String(row.store_id),
    store_name: String(row.store_name),
    address: String(row.address),
    phone: String(row.phone),
    business_hours: String(row.business_hours),
    status: str_(row.status) || APP.STORE_STATUS.ACTIVE,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

// 店舗の追加・更新（store_id が空なら新規登録）
function saveStore(input) {
  ensureSheets();

  const storeName = require_(input && input.store_name, '店舗名');
  const address = str_(input && input.address);
  const phone = str_(input && input.phone);
  const businessHours = str_(input && input.business_hours);
  const inputStoreId = str_(input && input.store_id);

  const sh = getSheet_(APP.SHEETS.STORES);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (inputStoreId) {
      // --- 更新 ---
      const target = readTable_(sh).filter(function (r) {
        return String(r.store_id) === inputStoreId;
      })[0];
      if (!target) {
        throw new Error('店舗（' + inputStoreId + '）が見つかりません。');
      }
      const row = toStoreObj_(target);
      row.store_name = storeName;
      row.address = address;
      row.phone = phone;
      row.business_hours = businessHours;
      row.updated_at = nowStr_();
      sh.getRange(target._row, 1, 1, 8).setValues([[
        row.store_id, row.store_name, row.address, row.phone,
        row.business_hours, row.status, row.created_at, row.updated_at
      ]]);
      return { ok: true, message: '店舗情報を更新しました。', stores: listStoresInternal_() };
    }

    // --- 新規登録 ---
    if (activeStoreNameExists_(sh, storeName)) {
      throw new Error('同名の「稼働中」店舗が既に登録されています: ' + storeName);
    }
    const storeId = nextStoreId_(sh);
    const now = nowStr_();
    sh.appendRow([storeId, storeName, address, phone, businessHours, APP.STORE_STATUS.ACTIVE, now, now]);
    return { ok: true, message: '店舗「' + storeName + '」を登録しました。（店舗ID: ' + storeId + '）', stores: listStoresInternal_() };
  } finally {
    lock.releaseLock();
  }
}

// 店舗の利用停止 / 再開
function setStoreStatus(input) {
  ensureSheets();

  const storeId = require_(input && input.store_id, '店舗ID');
  const status = require_(input && input.status, 'ステータス');
  if (status !== APP.STORE_STATUS.ACTIVE && status !== APP.STORE_STATUS.SUSPENDED) {
    throw new Error('ステータスの値が不正です。');
  }

  const sh = getSheet_(APP.SHEETS.STORES);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const target = readTable_(sh).filter(function (r) {
      return String(r.store_id) === storeId;
    })[0];
    if (!target) {
      throw new Error('店舗（' + storeId + '）が見つかりません。');
    }
    sh.getRange(target._row, 6).setValue(status); // status列
    sh.getRange(target._row, 8).setValue(nowStr_()); // updated_at列
  } finally {
    lock.releaseLock();
  }

  const message = status === APP.STORE_STATUS.ACTIVE
    ? '店舗を「稼働中」に戻しました。'
    : '店舗を「利用停止」にしました。（データは残ります）';
  return { ok: true, message: message, stores: listStoresInternal_() };
}

// 同名の「稼働中」店舗が既にあるかチェック（新規登録時のみ）
function activeStoreNameExists_(sh, name) {
  return readTable_(sh).some(function (r) {
    return str_(r.store_name) === name && (str_(r.status) || APP.STORE_STATUS.ACTIVE) === APP.STORE_STATUS.ACTIVE;
  });
}

// 店舗ID（ST0001 形式）を採番する
function nextStoreId_(sh) {
  let max = 0;
  readTable_(sh).forEach(function (r) {
    const m = /^ST(\d+)$/.exec(String(r.store_id));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'ST' + ('0000' + (max + 1)).slice(-4);
}
