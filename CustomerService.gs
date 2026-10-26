/**
 * ============================================================
 * CustomerService.gs — 共通顧客台帳（第2段階のタブ④）
 * ============================================================
 * ・グループ共通のCustomersシートを1つの台帳として使う
 * ・識別はLINEユーザーID（line_user_id）、内部IDはcustomer_id（CU0001形式）
 * ・友だち解除されても履歴は削除しない（friend_status を変えるだけ）
 * 画面から呼べるのは listCustomers / importFollowers の2つです。
 */

// 管理画面④タブ用: 顧客一覧と統計
function listCustomers() {
  ensureSheets();
  const rows = readTable_(getSheet_(APP.SHEETS.CUSTOMERS));
  const customers = rows
    .filter(function (r) { return str_(r.customer_id) !== ''; })
    .map(toCustomerObj_);
  // 新しい登録順に並べる
  customers.sort(function (a, b) { return a.joined_at < b.joined_at ? 1 : -1; });
  return {
    customers: customers,
    stats: {
      total: customers.length,
      followed: customers.filter(function (c) { return c.friend_status === APP.FRIEND_STATUS.FOLLOWED; }).length
    }
  };
}

// 1行を画面用のオブジェクトに変換する
function toCustomerObj_(row) {
  return {
    customer_id: String(row.customer_id),
    line_user_id: String(row.line_user_id),
    display_name: String(row.display_name),
    joined_at: String(row.joined_at),
    friend_status: str_(row.friend_status) || APP.FRIEND_STATUS.FOLLOWED,
    last_interaction_at: String(row.last_interaction_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

/**
 * 顧客を登録または最新化する（followイベント・取り込みから呼ばれる）
 * presetName に表示名を渡されたらAPI呼び出しを省略する
 */
function registerCustomer_(lineUserId, presetName) {
  let displayName = str_(presetName);
  if (!displayName) {
    const profile = fetchProfile_(lineUserId);
    if (profile.ok) displayName = profile.displayName;
  }

  const sh = getSheet_(APP.SHEETS.CUSTOMERS);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const now = nowStr_();

    const rows = readTable_(sh);
    const target = rows.filter(function (r) {
      return String(r.line_user_id) === lineUserId;
    })[0];

    if (target) {
      // 登録済み: 友だち状態と表示名だけ最新化（重複登録しない）
      sh.getRange(target._row, 5).setValue(APP.FRIEND_STATUS.FOLLOWED);   // friend_status
      if (displayName) sh.getRange(target._row, 3).setValue(displayName); // display_name
      sh.getRange(target._row, 9).setValue(now);                          // updated_at
      return String(target.customer_id);
    }

    // 新規登録
    const customerId = nextCustomerId_(sh);
    sh.appendRow([customerId, lineUserId, displayName, now, APP.FRIEND_STATUS.FOLLOWED, '', '', now, now]);
    return customerId;
  } finally {
    lock.releaseLock();
  }
}

// 顧客ID（CU0001 形式）を採番する
function nextCustomerId_(sh) {
  let max = 0;
  readTable_(sh).forEach(function (r) {
    const m = /^CU(\d+)$/.exec(String(r.customer_id));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'CU' + ('0000' + (max + 1)).slice(-4);
}

// 友だち状態を変更する（履歴は削除しない）
function setFriendStatus_(lineUserId, status) {
  const sh = getSheet_(APP.SHEETS.CUSTOMERS);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rows = readTable_(sh);
    const target = rows.filter(function (r) {
      return String(r.line_user_id) === lineUserId;
    })[0];
    if (!target) return; // 台帳にいない相手は何もしない
    sh.getRange(target._row, 5).setValue(status);   // friend_status
    sh.getRange(target._row, 9).setValue(nowStr_()); // updated_at
  } finally {
    lock.releaseLock();
  }
}

// 最終反応日時を更新する（メッセージ受信時）
function touchLastInteraction_(lineUserId) {
  const sh = getSheet_(APP.SHEETS.CUSTOMERS);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rows = readTable_(sh);
    const target = rows.filter(function (r) {
      return String(r.line_user_id) === lineUserId;
    })[0];
    if (!target) return;
    sh.getRange(target._row, 6).setValue(nowStr_()); // last_interaction_at
  } finally {
    lock.releaseLock();
  }
}

// LINE APIでプロフィール（表示名）を取得する
function fetchProfile_(lineUserId) {
  const token = PropertiesService.getScriptProperties().getProperty(APP.PROP_LINE_TOKEN);
  if (!token) return { ok: false, displayName: '' };
  try {
    const res = UrlFetchApp.fetch(APP.LINE_API_BASE + '/v2/bot/profile/' + encodeURIComponent(lineUserId), {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const info = JSON.parse(res.getContentText());
      return { ok: true, displayName: info.displayName ? String(info.displayName) : '' };
    }
    return { ok: false, displayName: '' };
  } catch (err) {
    return { ok: false, displayName: '' };
  }
}

/**
 * 既存の友だちを一括取り込む（管理画面④タブのボタン）
 * Webhook導入前に友だちだった人を台帳へ登録します。
 * 取り込み済みの人は重複登録されません。
 */
function importFollowers() {
  ensureSheets();

  const token = PropertiesService.getScriptProperties().getProperty(APP.PROP_LINE_TOKEN);
  if (!token) {
    throw new Error('LINE未接続です。先に「③ LINE接続」で接続確認を済ませてください。');
  }
  const headers = { Authorization: 'Bearer ' + token };

  let start = null;
  let imported = 0;
  let pages = 0;

  do {
    // 友だちID一覧を1,000件ずつ取得
    let url = APP.LINE_API_BASE + '/v2/bot/followers/ids?limit=1000';
    if (start) url += '&start=' + encodeURIComponent(start);
    const res = UrlFetchApp.fetch(url, { method: 'get', headers: headers, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error('友だちIDの取得に失敗しました（HTTP ' + res.getResponseCode() + '）。時間をおいて再度お試しください。');
    }
    const data = JSON.parse(res.getContentText());
    const ids = data.userIds || [];

    // 表示名を20件ずつ並列取得（速度稼ぎ。失敗したら空名で登録）
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      const requests = chunk.map(function (id) {
        return {
          url: APP.LINE_API_BASE + '/v2/bot/profile/' + encodeURIComponent(id),
          method: 'get',
          headers: headers,
          muteHttpExceptions: true
        };
      });
      const responses = UrlFetchApp.fetchAll(requests);
      responses.forEach(function (profileRes, idx) {
        let name = '';
        try {
          if (profileRes.getResponseCode() === 200) {
            name = String(JSON.parse(profileRes.getContentText()).displayName || '');
          }
        } catch (ignored) {}
        registerCustomer_(chunk[idx], name);
        imported++;
      });
    }

    start = data.next || null;
    pages++;
    if (pages >= 20) break; // 上限2万人まで（それ以上は今後の段階で対応）
  } while (start);

  const result = listCustomers();
  return {
    ok: true,
    message: '取り込みが完了しました（今回確認: ' + imported + '件）。既存の顧客データは上書きしていません。',
    customers: result.customers,
    stats: result.stats
  };
}
