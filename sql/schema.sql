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
