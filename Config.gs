/**
 * ============================================================
 * Config.gs — システム全体の定数
 * ============================================================
 * シート名やステータス値など、決め打ちする値はこのファイルに集めます。
 * 変更する場合はプロジェクト全体への影響を確認してから行ってください。
 */

const APP = {
  // システムのバージョン（第3段階）
  VERSION: '0.3.0',

  // グループ共通のタイムゾーン
  TZ: 'Asia/Tokyo',

  // シート名（データ設計で決定した9シート）
  SHEETS: {
    GROUP: 'GroupSettings',
    STORES: 'Stores',
    LINE: 'LineSettings',
    CUSTOMERS: 'Customers',
    RESERVATIONS: 'Reservations',
    VISITS: 'VisitHistory',
    CAMPAIGNS: 'Campaigns',
    MESSAGES: 'MessageLogs',
    COUPONS: 'CouponLogs'
  },

  // 各シートのヘッダー行（データ設計どおり）
  HEADERS: {
    GroupSettings: ['setting_key', 'setting_value', 'updated_at'],
    Stores: ['store_id', 'store_name', 'address', 'phone', 'business_hours', 'status', 'created_at', 'updated_at'],
    LineSettings: ['connection_id', 'channel_id', 'bot_user_id', 'connection_status', 'last_checked_at'],
    Customers: ['customer_id', 'line_user_id', 'display_name', 'joined_at', 'friend_status', 'last_interaction_at', 'consent_status', 'created_at', 'updated_at'],
    Reservations: ['reservation_id', 'customer_id', 'store_id', 'reservation_datetime', 'party_size', 'customer_name', 'phone', 'status', 'source', 'notes', 'created_at', 'updated_at'],
    VisitHistory: ['visit_id', 'customer_id', 'store_id', 'visited_at', 'reservation_id', 'campaign_id', 'notes'],
    Campaigns: ['campaign_id', 'campaign_name', 'message_content', 'target_store_ids', 'start_at', 'end_at', 'status', 'created_at', 'updated_at'],
    MessageLogs: ['message_id', 'campaign_id', 'customer_id', 'sent_at', 'delivery_status', 'error_message'],
    CouponLogs: ['coupon_use_id', 'coupon_id', 'customer_id', 'store_id', 'used_at', 'reservation_id']
  },

  // 店舗のステータス
  STORE_STATUS: {
    ACTIVE: 'active',      // 稼働中
    SUSPENDED: 'suspended' // 利用停止
  },

  // LINE接続のステータス
  LINE_STATUS: {
    CONNECTED: 'connected',       // 接続確認済み
    DISCONNECTED: 'disconnected', // 未接続
    ERROR: 'error'                // 認証エラーなど
  },

  // 顧客の友だち状態（LINEの友だち状態と顧客履歴は別々に管理する方針）
  FRIEND_STATUS: {
    FOLLOWED: 'followed',    // 友だち
    UNFOLLOWED: 'unfollowed' // 解除済み（履歴は残す）
  },

  // 予約のステータス（第3段階）
  RESERVATION_STATUS: {
    RESERVED: 'reserved',    // 予約済み
    VISITED: 'visited',      // 来店済み
    CANCELLED: 'cancelled',  // キャンセル
    NO_SHOW: 'no_show'       // 無断キャンセル
  },

  // LineSettingsシートに保存する1行のID（グループ共通1アカウントのため固定値）
  LINE_CONNECTION_ID: 'LINE_MAIN',

  // スクリプトプロパティのキー
  PROP_LINE_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN', // チャネルアクセストークン（機密）
  PROP_SHARED_KEY: 'WEBHOOK_SHARED_KEY',        // Worker→GAS転送の共有キー（機密）
  PROP_LIFF_ID: 'LIFF_ID',                     // LIFFアプリID（LINE内予約フォーム用）
  PROP_RESERVE_KEY: 'RESERVE_API_KEY'           // 予約フォームAPIの送信キー（自動生成）

  ,
  // LINE Messaging API のベースURL
  LINE_API_BASE: 'https://api.line.me'
};
