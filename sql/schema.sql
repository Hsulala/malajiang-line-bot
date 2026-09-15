-- 麻辣工坊 LINE 官方帳號 客戶開發自動化 — 資料庫結構
-- PostgreSQL

CREATE TABLE IF NOT EXISTS customers (
  id              SERIAL PRIMARY KEY,
  line_user_id    VARCHAR(64) UNIQUE NOT NULL,
  display_name    VARCHAR(255),
  store_name      VARCHAR(255),
  contact_name    VARCHAR(255),
  phone           VARCHAR(50),
  address         TEXT,
  interest_line   VARCHAR(20),                     -- 'malajiang' | 'herb' | 'both'
  stage           VARCHAR(20) NOT NULL DEFAULT 'new', -- new, confirm, shipped, tracking, won, closed
  shipped_at      DATE,
  shipping_note   TEXT,
  owner_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_samples (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sample_name   VARCHAR(255) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_samples_customer ON customer_samples(customer_id);

CREATE TABLE IF NOT EXISTS timeline_events (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_text    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timeline_customer ON timeline_events(customer_id, created_at);

CREATE TABLE IF NOT EXISTS followups (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  followup_type   VARCHAR(10) NOT NULL,             -- 'd2' | 'd16'
  scheduled_date  DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, replied, skipped
  sent_at         TIMESTAMPTZ,
  reply_text      TEXT,
  replied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followups_pending ON followups(status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_followups_customer ON followups(customer_id);

CREATE TABLE IF NOT EXISTS admin_login_log (
  id          SERIAL PRIMARY KEY,
  ip          VARCHAR(64),
  success     BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 熟客直接傳文字下單：機器人偵測到疑似下單訊息時，記錄下來並通知老闆，
-- 不會自動當成正式訂單處理（仍要老闆在後台確認），避免誤判。
CREATE TABLE IF NOT EXISTS order_messages (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  message_text  TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, ignored
  owner_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_messages_status ON order_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_messages_customer ON order_messages(customer_id);

-- FAQ / 知識庫：老闆可在後台自行新增、修改、刪除常見問答。
-- auto_reply 決定「機器人是否要直接在 LINE 上自動回覆」這一則答案 —
-- 老闆還不確定答案是否正確時，可以先存起來但不開自動回覆，之後確認沒問題再打開。
CREATE TABLE IF NOT EXISTS faqs (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(50),
  question    VARCHAR(255) NOT NULL,
  answer      TEXT NOT NULL,
  keywords    TEXT NOT NULL DEFAULT '',       -- 逗號分隔的觸發關鍵字
  is_active   BOOLEAN NOT NULL DEFAULT true,  -- 是否顯示在知識庫（老闆自己/員工參考用）
  auto_reply  BOOLEAN NOT NULL DEFAULT false, -- 是否讓機器人在 LINE 上依關鍵字自動回覆這則答案
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(is_active);
