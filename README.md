# 麻辣工坊 LINE 官方帳號客戶開發自動化

把「客戶加好友 → 挑產品線 → 填收件資料(LIFF表單) → 老闆確認訂單 → 出貨通知 → D+2/D+16自動追蹤」整套流程程式化，並提供一個給老闆用的客戶看板後台。

包含三個部分：

1. **LINE Webhook 機器人**（`src/webhook.js`）：處理加好友、關鍵字對話、串起 LIFF 表單連結
2. **LIFF 樣品申請表單**（`public/liff/sample-form.html`）：客戶在 LINE 內填寫店名/聯絡人/電話/地址/想試品項
3. **後台管理系統**（`public/admin/`）：老闆登入後看客戶看板、確認訂單並觸發出貨通知、寫備註、看互動歷程

技術棧：Node.js + Express + PostgreSQL，設計為部署在 Railway（一個服務跑 Node，另一個服務跑 PostgreSQL）。

---

## 一、本機安裝

```bash
npm install
cp .env.example .env
# 打開 .env 依照下面「二、需要準備的資料」章節逐項填入
npm run migrate   # 建立資料表（第一次執行、或之後改了 sql/schema.sql 都要重跑）
npm run dev       # 本機啟動，預設 http://localhost:3000
```

本機測試 LINE webhook 需要一個對外可存取的網址，建議直接部署到 Railway 測試（見下方），比在本機用 ngrok 轉發更省事、也比較貼近正式環境。

---

## 二、需要準備的資料（LINE Developers Console）

前往 https://developers.line.biz/console/ ，用工廠老闆的帳號（或你已取得授權管理的帳號）操作：

### 1. 建立 / 使用一個 Provider 與 Messaging API Channel
- 建立 Provider（例如「麻辣工坊」）
- 在裡面建立一個 **Messaging API** Channel（這就是官方帳號本體）
- 進入該 Channel 的 **Messaging API** 分頁：
  - 停用「Auto-reply messages」與「Greeting messages」（避免跟我們自己的機器人回覆互相干擾）
  - 產生 **Channel access token (long-lived)** → 填入 `.env` 的 `LINE_CHANNEL_ACCESS_TOKEN`
- 進入該 Channel 的 **Basic settings** 分頁：
  - 複製 **Channel secret** → 填入 `LINE_CHANNEL_SECRET`
  - 複製 **Channel ID** → 填入 `LINE_CHANNEL_ID`（用來驗證 LIFF 的 idToken）

### 2. 建立 LIFF App（樣品申請表單）
- 在同一個 Channel 底下的 **LIFF** 分頁 → Add
  - Endpoint URL 填：`https://你的Railway網域/liff/sample-form.html`（要先部署一次拿到網域，再回來補這個設定）
  - Size 選 `Full` 或 `Tall`
  - Scope 勾選 `profile`, `openid`
- 建立後複製 **LIFF ID**（格式像 `1234567890-AbCdEfGh`）→ 填入 `.env` 的 `LIFF_ID`

### 3. 設定 Webhook URL
- 回到 **Messaging API** 分頁 → Webhook settings
  - Webhook URL 填：`https://你的Railway網域/webhook`
  - 開啟「Use webhook」
  - 可以用它內建的「Verify」按鈕測試連線是否成功（要先部署完成、且環境變數都設定好）

### 4. 取得老闆的 LINE userId（用來接收訂單/回覆通知）
最簡單的做法：
1. 先完成部署，讓機器人上線
2. 請老闆的 LINE 帳號加這個官方帳號好友
3. 到 Railway 的 Logs 裡找 `follow` 事件那行（可以暫時在 `handleEvent` 的 follow 分支加一行 `console.log(userId)`，測完再拿掉，或直接看資料庫 `customers` 表最新一筆 `line_user_id`）
4. 把這個 userId 填入 `.env` 的 `OWNER_LINE_USER_ID`

---

## 三、部署到 Railway

1. 在 Railway 建一個新專案，新增一個 **PostgreSQL** 服務（Railway 會自動產生 `DATABASE_URL`）
2. 在同專案新增一個 **GitHub Repo / Empty Service** 部署這個程式碼資料夾
3. 到這個 Node 服務的 **Variables**，把 `.env.example` 裡列的變數都設定好：
   - `DATABASE_URL` 直接參考 Postgres 服務提供的變數（Railway 可以用 Reference Variable 帶入，不用手動複製）
   - 其餘（`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ID`、`LIFF_ID`、`OWNER_LINE_USER_ID`、`ADMIN_PASSWORD`、`JWT_SECRET`）依照上面章節填入
   - 建議加 `TZ=Asia/Taipei`，讓每天 9:00 的排程對齊台灣時間
   - `PUBLIC_BASE_URL` 填正式網域
4. Deploy 完成後，Railway 會給一個網域，例如 `https://malajiang-bot.up.railway.app`
5. 回 LINE Developers Console 把 Webhook URL、LIFF Endpoint URL 補上這個網域（見上一章節）
6. 到 Railway 服務的 Shell（或本機指向同一個 `DATABASE_URL`）執行一次：
   ```bash
   npm run migrate
   ```
7. 打開 `https://你的網域/admin` 用 `ADMIN_PASSWORD` 登入，確認看板可以打開（一開始會是空的，因為還沒有真實客戶資料）

---

## 四、系統邏輯說明

### 對話流程（對應 `src/productLines.js` + `src/webhook.js`）
1. 客戶加好友 → 機器人自動傳歡迎訊息 + 「麻辣醬 / 中藥材」快速選單
2. 客戶點選（或直接輸入）其中一個關鍵字 → 機器人回傳該產品線的樣品說明，並附上開啟 LIFF 表單的按鈕
3. 客戶在 LIFF 表單填店名/聯絡人/電話/地址/想試品項並送出 → 系統寫入資料庫、階段變成「待老闆確認」，並主動推播訊息通知老闆
4. 老闆在後台看板打開這位客戶、填出貨日期與備註、按「確認訂單並通知客戶出貨」→ 系統推播出貨通知給客戶、階段變「已出貨」、自動排好 D+2 與 D+16 兩筆追蹤
5. 排程器（`src/scheduler.js`）每天早上 9:00 檢查有沒有到期的 D+2 / D+16，到了就自動推播訊息、階段推進為「樣品追蹤中」
6. 客戶回覆追蹤訊息時，內容會被記錄進該筆追蹤紀錄，並轉發通知老闆
7. 老闆可以隨時在後台把階段手動改成「已成交」或「結案」

### 「中藥材」產品線話術待補
目前心智圖裡沒有中藥材這條線詳細的樣品清單與話術，`src/productLines.js` 裡先用 `[TODO]` 佔位。之後補齊的話，直接改這個檔案裡 `PRODUCT_LINES.herb` 底下的 `introMessage` / `samples` / `d2Message` / `d16Message` 幾個欄位存檔重新部署即可，不用改任何邏輯程式碼。

### 資料庫結構
見 `sql/schema.sql`，六張表：`customers`（客戶主檔）、`customer_samples`（申請的樣品項目）、`timeline_events`（互動歷程時間軸）、`followups`（D+2/D+16 追蹤排程與回覆記錄）、`order_messages`（熟客文字下單記錄）、`faqs`（FAQ 知識庫）。

### 熟客文字下單記錄（`src/orderDetector.js` + `src/orderRepo.js`）
只要客戶已經走完至少一次樣品流程（階段是「已出貨/樣品追蹤中/已成交」），機器人就會把符合下單語意的文字訊息（例如提到「下單」「貨到付款」「月結」，或出現「5包」「10斤」這類數量單位）記錄下來，並推播通知老闆，客戶也會收到「已收到，老闆確認後會盡快聯繫」的自動回覆。這個判斷**故意放在產品線關鍵字比對之前**，避免下單訊息裡剛好提到品項名稱（如「麻辣醬」）被誤判成重新選產品線。

跟樣品訂單一樣，這裡**刻意不會自動變成正式訂單**——老闆需要到後台「訂單記錄」分頁看過內容，手動標記「已確認」或「忽略」，實際出貨仍是走原本客戶詳細頁裡的出貨流程。

### FAQ 知識庫（`src/faqRepo.js`）
後台新增了「FAQ 知識庫」分頁，老闆可以自行新增/編輯/刪除問答，欄位包含分類、問題、答案、觸發關鍵字。每則問答有一個獨立的「自動回覆」開關：
- **關閉**（預設）：只存在知識庫裡給老闆/員工自己查閱參考，機器人不會主動用這個答案回覆客戶。
- **開啟**：客戶在 LINE 上的訊息如果包含設定的關鍵字，機器人會直接把這則答案回覆給客戶。

這樣設計是因為工廠過往的歷史對話紀錄裡，某些問題（例如保存期限）老闆自己在不同時間點給的答案不完全一致，建議**先把答案存進知識庫、跟老闆核對過沒問題後，再把「自動回覆」打開**，避免機器人講出不確定或過時的資訊。

### 保留人工判斷的部分
依照先前討論的顧慮，訂單「確認」與「出貨通知」這一步刻意設計成**一定要老闆在後台按確認**才會觸發，機器人不會自動幫忙下單出貨；機器人只負責前段接待、收資料、與後段自動追蹤提醒。

---

## 五、目前尚未涵蓋、之後可以再擴充的部分

- 中藥材產品線的實際話術與樣品清單（見上方 TODO）
- 客戶回覆內容目前只會原文記錄+通知老闆，沒有自動判讀「有收到/沒收到」；如果之後想做自動判斷語意可以再加
- 後台目前是單一組管理密碼登入，如果未來有多人（例如業務助理）需要不同權限，需要再擴充帳號系統
- 沒有做客戶名單的批次匯入/匯出功能
- 「熟客文字下單」的判斷是關鍵字/規則式，不是語意理解，遇到講法很委婉或很少見的下單方式可能抓不到；抓不到時客戶訊息還是會走到 FAQ／預設選單流程，不會遺失，只是不會被歸類成「訂單記錄」
- FAQ 目前是關鍵字比對（比對訊息裡有沒有包含設定的關鍵字），不是真正理解語意；未來如果想做更聰明的問答，可以考慮接 AI（例如 Claude API）依知識庫內容生成回覆
