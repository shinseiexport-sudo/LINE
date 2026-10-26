/**
 * ============================================================
 * ReservationService.gs — 予約管理（第3段階のタブ⑤）
 * ============================================================
 * Reservations シートへの読み書きを担当します。
 * 予約は「削除」より「ステータス変更」を基本とします
 * （キャンセル・無断キャンセルも履歴として残すため）。
 * 画面から呼べるのは listReservations / saveReservation /
 * setReservationStatus / deleteReservation の4つです。
 */

// クライアントへ予約一覧（全件・日時の古い順）を返す。絞り込みは画面側で行う
function listReservations() {
  ensureSheets();
  return { ok: true, reservations: listReservationsInternal_() };
}

// 内部用: 店舗名を埋めた予約一覧を返す
function listReservationsInternal_() {
  const storeMap = {};
  listStoresInternal_().forEach(function (s) { storeMap[s.store_id] = s.store_name; });
  return readTable_(getSheet_(APP.SHEETS.RESERVATIONS))
    .filter(function (r) { return str_(r.reservation_id) !== ''; })
    .map(function (r) {
      const o = toReservationObj_(r);
      o.store_name = storeMap[o.store_id] || o.store_id;
      return o;
    })
    .sort(function (a, b) { return a.reservation_datetime < b.reservation_datetime ? -1 : 1; });
}

// 1行を画面用のオブジェクトに変換する
function toReservationObj_(row) {
  return {
    reservation_id: String(row.reservation_id),
    customer_id: String(row.customer_id),
    store_id: String(row.store_id),
    reservation_datetime: String(row.reservation_datetime),
    party_size: Number(row.party_size) || 0,
    customer_name: String(row.customer_name),
    phone: String(row.phone),
    status: str_(row.status) || APP.RESERVATION_STATUS.RESERVED,
    source: str_(row.source) || 'admin',
    notes: String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

// 予約の追加・更新（reservation_id が空なら新規登録）
function saveReservation(input) {
  ensureSheets();

  const storeId = require_(input && input.store_id, '店舗');
  const customerName = require_(input && input.customer_name, 'お名前');
  const datetime = require_(input && input.reservation_datetime, '予約日時');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(datetime)) {
    throw new Error('予約日時の形式が正しくありません。日付と時刻を選択してください。');
  }
  const partySize = parseInt(input && input.party_size, 10);
  if (isNaN(partySize) || partySize < 1 || partySize > 99) {
    throw new Error('人数は1〜99で入力してください。');
  }
  const phone = str_(input && input.phone);
  const notes = str_(input && input.notes);
  const customerId = str_(input && input.customer_id);
  const inputId = str_(input && input.reservation_id);

  // 店舗の存在チェック
  const store = listStoresInternal_().filter(function (s) { return s.store_id === storeId; })[0];
  if (!store) {
    throw new Error('店舗（' + storeId + '）が見つかりません。先に「② 店舗管理」で登録してください。');
  }

  const sh = getSheet_(APP.SHEETS.RESERVATIONS);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const now = nowStr_();

    if (inputId) {
      // --- 更新（状態と作成日時は保持する） ---
      const target = readTable_(sh).filter(function (r) {
        return String(r.reservation_id) === inputId;
      })[0];
      if (!target) {
        throw new Error('予約（' + inputId + '）が見つかりません。');
      }
      const status = str_(target.status) || APP.RESERVATION_STATUS.RESERVED;
      const createdAt = String(target.created_at) || now;
      sh.getRange(target._row, 1, 1, 12).setValues([[
        inputId, customerId, storeId, datetime, partySize, customerName, phone,
        status, str_(target.source) || 'admin', notes, createdAt, now
      ]]);
    } else {
      // --- 新規登録 ---
      const reservationId = nextReservationId_(sh);
      sh.appendRow([reservationId, customerId, storeId, datetime, partySize, customerName, phone,
        APP.RESERVATION_STATUS.RESERVED, 'admin', notes, now, now]);
    }
  } finally {
    lock.releaseLock();
  }

  return { ok: true, message: '予約を保存しました。', reservations: listReservationsInternal_() };
}

// 予約の状態を変更する（reserved / visited / cancelled / no_show）
function setReservationStatus(input) {
  ensureSheets();

  const id = require_(input && input.reservation_id, '予約ID');
  const status = require_(input && input.status, 'ステータス');
  const valid = Object.keys(APP.RESERVATION_STATUS).map(function (k) { return APP.RESERVATION_STATUS[k]; });
  if (valid.indexOf(status) === -1) {
    throw new Error('ステータスの値が不正です。');
  }

  const sh = getSheet_(APP.SHEETS.RESERVATIONS);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const target = readTable_(sh).filter(function (r) {
      return String(r.reservation_id) === id;
    })[0];
    if (!target) {
      throw new Error('予約（' + id + '）が見つかりません。');
    }
    sh.getRange(target._row, 8).setValue(status);   // status列
    sh.getRange(target._row, 12).setValue(nowStr_()); // updated_at列
  } finally {
    lock.releaseLock();
  }

  return { ok: true, message: '状態を変更しました。', reservations: listReservationsInternal_() };
}

// 予約を削除する（履歴ごと消える。基本は「キャンセル」を使うこと）
function deleteReservation(input) {
  ensureSheets();

  const id = require_(input && input.reservation_id, '予約ID');
  const sh = getSheet_(APP.SHEETS.RESERVATIONS);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const target = readTable_(sh).filter(function (r) {
      return String(r.reservation_id) === id;
    })[0];
    if (!target) {
      throw new Error('予約（' + id + '）が見つかりません。');
    }
    sh.deleteRow(target._row);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, message: '予約を削除しました。', reservations: listReservationsInternal_() };
}

// 予約ID（RS0001 形式）を採番する
function nextReservationId_(sh) {
  let max = 0;
  readTable_(sh).forEach(function (r) {
    const m = /^RS(\d+)$/.exec(String(r.reservation_id));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'RS' + ('0000' + (max + 1)).slice(-4);
}

/**
 * LIFF（LINE内の予約フォーム）からのお客様自身の予約登録。
 * ・顧客台帳にLINEユーザーとして自動登録（登録済みならそれを使う）
 * ・予約は source='liff' で Reservations シートに追加
 * ・管理者（GroupSettingsのadmin_email）へメール通知
 */
function createReservationByCustomer(input) {
  ensureSheets();

  const lineUserId = require_(input && input.lineUserId, 'LINEユーザー情報');
  const lineName = str_(input && input.lineName);
  const storeId = require_(input && input.store_id, '店舗');
  const date = require_(input && input.date, '予約日');
  const time = require_(input && input.time, '予約時刻');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('予約日の形式が正しくありません。もう一度お試しください。');
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('予約時刻の形式が正しくありません。もう一度お試しください。');
  }
  const datetime = date + ' ' + time;
  const partySize = parseInt(input && input.party_size, 10);
  if (isNaN(partySize) || partySize < 1 || partySize > 99) {
    throw new Error('人数は1〜99で選択してください。');
  }
  const name = require_(input && input.customer_name, 'お名前');
  const phone = str_(input && input.phone);
  if (phone && !/^[0-9\-+()]{10,17}$/.test(phone)) {
    throw new Error('電話番号の形式を確認してください（例: 09012345678）。');
  }
  const notes = str_(input && input.notes);

  // 店舗の存在チェック
  const store = listStoresInternal_().filter(function (s) { return s.store_id === storeId; })[0];
  if (!store) {
    throw new Error('店舗が見つかりません。もう一度お試しください。');
  }

  // 顧客台帳に登録（登録済みなら既存の顧客IDを返す）
  const customerId = registerCustomer_(lineUserId, lineName);

  const sh = getSheet_(APP.SHEETS.RESERVATIONS);
  const lock = LockService.getScriptLock();
  let reservationId = '';
  try {
    lock.waitLock(30000);
    const now = nowStr_();
    reservationId = nextReservationId_(sh);
    sh.appendRow([reservationId, customerId, storeId, datetime, partySize, name, phone,
      APP.RESERVATION_STATUS.RESERVED, 'liff', notes, now, now]);
  } finally {
    lock.releaseLock();
  }

  // 店にメールで知らせる（メールが失敗しても予約自体は成立させる）
  mailNewReservation_(store, reservationId, datetime, partySize, name, phone, notes, customerId);

  return { ok: true, reservation_id: reservationId };
}

// 新規予約のメール通知（GroupSettingsのadmin_email宛）
function mailNewReservation_(store, reservationId, datetime, partySize, name, phone, notes, customerId) {
  const to = getOwnerEmail_();
  if (!to) return; // 通知先が分からないときは何もしない
  const subject = '【新規予約】' + store.store_name + ' ' + datetime + ' ' + name + ' 様（' + partySize + '名）';
  const body =
    '新しい予約が入りました。\n\n' +
    '予約番号: ' + reservationId + '\n' +
    '顧客ID: ' + customerId + '\n' +
    '店舗: ' + store.store_name + '\n' +
    '日時: ' + datetime + '\n' +
    '人数: ' + partySize + '名\n' +
    'お名前: ' + name + '\n' +
    '電話番号: ' + (phone || '（未入力）') + '\n' +
    'メモ: ' + (notes || '（なし）') + '\n\n' +
    '管理画面で確認してください。';
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });
  } catch (err) {
    // 通知だけの失敗で予約を消さない
  }
}
