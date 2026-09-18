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

-- internal_note：老闆自己看的內部備註，永遠不會傳給客戶（就算 auto_reply 開啟也不會用到這欄）。
-- 用來標記像「答案不確定，需跟老闆核對」這類提醒，跟客戶會看到的 answer 分開存放。
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS internal_note TEXT;

-- 歷史客戶紀錄：從工廠過往 LINE 官方帳號對話紀錄匯入的舊客戶資料，僅供後台查閱/搜尋參考，
-- 完全獨立於正式的 customers 看板（沒有 line_user_id，無法主動推播訊息），
-- 這樣匯入舊資料不會影響、也不會混進現有的客戶開發流程。
CREATE TABLE IF NOT EXISTS historical_customers (
  id                SERIAL PRIMARY KEY,
  display_name      VARCHAR(255),
  store_name        VARCHAR(255),
  contact_name      VARCHAR(255),
  phone             VARCHAR(50),
  address           TEXT,
  product_interest  VARCHAR(255),
  tag               VARCHAR(20),   -- 'red' | 'purple' | null，對應原本 LINE OA 官方帳號自己標記的客戶標籤
  likely_ordered    BOOLEAN NOT NULL DEFAULT false,
  message_count     INTEGER NOT NULL DEFAULT 0,
  first_contact_at  VARCHAR(20),
  last_contact_at   VARCHAR(20),
  summary           TEXT,          -- 對話重點摘要（最後幾則客戶訊息）
  source_file       VARCHAR(255),  -- 原始匯出檔名，方便追溯回原始對話紀錄
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historical_customers_name ON historical_customers(display_name);
CREATE INDEX IF NOT EXISTS idx_historical_customers_phone ON historical_customers(phone);

-- 商品目錄（母目錄）：工廠完整批發品項，價格/品名都在後台可編輯、不寫死在程式碼裡。
-- 「超級管理者」才能新增/編輯/下架品項；一般管理者（老闆）只能瀏覽、拿來挑選要加碼給客人的品項。
CREATE TABLE IF NOT EXISTS catalog_items (
  id            SERIAL PRIMARY KEY,
  category      VARCHAR(50) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  spec          VARCHAR(100),             -- 規格，例如「3kg裝」「1斤」「1包(150g)」
  unit_price    NUMERIC(10,2),
  price_unit    VARCHAR(20) NOT NULL DEFAULT '', -- 例如 /kg、/斤，留空代表單價就是整包/整份的價格
  is_active     BOOLEAN NOT NULL DEFAULT true,   -- 下架用，不做實體刪除，避免舊訂單/樣品紀錄的關聯斷掉
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON catalog_items(category, sort_order);

-- 樣品模板：取代原本寫死在 productLines.js 裡的「麻辣醬／中藥材」兩條線，
-- 改成依店家類型（火鍋店/鍋燒麵店/牛肉麵店...）各自一份話術 + 建議樣品清單，
-- 一樣限「超級管理者」才能新增/編輯/下架，一般管理者（老闆）只能瀏覽。
CREATE TABLE IF NOT EXISTS sample_templates (
  id                SERIAL PRIMARY KEY,
  key               VARCHAR(50) UNIQUE NOT NULL,  -- 系統內部代碼，例如 hotpot、beef_noodle
  label             VARCHAR(50) NOT NULL,         -- 顯示名稱，例如「火鍋店」
  trigger_keywords  TEXT NOT NULL DEFAULT '',     -- 逗號分隔，客戶輸入文字比對用（label 本身一定會比對到，不用重複填）
  intro_message     TEXT NOT NULL DEFAULT '',
  d2_message        TEXT NOT NULL DEFAULT '',
  d16_message       TEXT NOT NULL DEFAULT '',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 每個樣品模板的候選品項（從商品目錄挑），客戶在 LIFF 表單裡最多勾選 7 樣。
CREATE TABLE IF NOT EXISTS sample_template_items (
  id                SERIAL PRIMARY KEY,
  template_id       INTEGER NOT NULL REFERENCES sample_templates(id) ON DELETE CASCADE,
  catalog_item_id   INTEGER NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(template_id, catalog_item_id)
);
CREATE INDEX IF NOT EXISTS idx_template_items_template ON sample_template_items(template_id, sort_order);

-- customer_samples 擴充：記錄這筆樣品是客戶自己在表單勾的，還是老闆事後在後台「加碼」加的，
-- 並關聯回商品目錄（catalog_item_id），方便之後統計哪些品項最常被拿來當樣品。
-- catalog_item_id 允許 NULL，是保留給舊資料（改版前就存在的 sample_name 純文字紀錄）相容用。
ALTER TABLE customer_samples ADD COLUMN IF NOT EXISTS catalog_item_id INTEGER REFERENCES catalog_items(id);
ALTER TABLE customer_samples ADD COLUMN IF NOT EXISTS added_by VARCHAR(10) NOT NULL DEFAULT 'customer'; -- 'customer' | 'owner'
