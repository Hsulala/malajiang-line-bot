// 機器人的通用話術設定（不屬於特定店家類型樣品模板的部分）。
// 各店家類型（火鍋店/牛肉麵店...）自己的話術與樣品清單已經改成存在資料庫
// （sample_templates / sample_template_items，見 sampleTemplateRepo.js），
// 後台「樣品模板管理」（超級管理者限定）可以直接編輯，不用再改這個檔案。

const WELCOME_MESSAGE =
  '◆ 歡迎光臨 麻辣醬工廠 ◆\n' +
  '我們本身能做的服務有這些：\n' +
  '◆ 各式乾辣椒、中藥材、濃縮高湯\n' +
  '◆ 麻辣醬、辣椒醬、高湯粉代工\n' +
  '◆ 冷凍調理包、常溫調理包\n' +
  '◆ 玻璃罐(170g~500g裝)\n\n' +
  '你是開什麼樣的店呢？可以直接點下面的選項，或跟我說說看～';

const FALLBACK_MESSAGE =
  '不好意思，我沒有聽懂唷～\n' +
  '可以先跟我說說你是開什麼樣的店嗎？也可以直接點下面的選項唷。';

const GENERIC_REPLY_ACK = '收到您的訊息囉，謝謝您～有任何問題都可以再跟我說！';

// 出貨通知的共用樣板，{{shippingNote}} 會被替換成老闆填的出貨備註
const SHIPPED_MESSAGE_TEMPLATE =
  '【出貨通知】已為您安排出貨：\n{{shippingNote}}\n' +
  '樣品箱較小會分兩件寄送，僅收一次費用唷～';

module.exports = {
  WELCOME_MESSAGE,
  FALLBACK_MESSAGE,
  GENERIC_REPLY_ACK,
  SHIPPED_MESSAGE_TEMPLATE,
};
