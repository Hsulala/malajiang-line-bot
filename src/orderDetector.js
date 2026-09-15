// 「熟客純文字下單」偵測邏輯
// 目的：讓已經合作過的熟客不用每次都跑 LIFF 表單，可以直接在 LINE 打字下單；
// 機器人偵測到疑似下單的文字後，記錄下來 + 通知老闆，但「不會」自動當成正式訂單處理，
// 一定要老闆在後台看過、按確認，才會真正進入出貨流程（跟樣品訂單的設計精神一致）。

// 熟客定義：已經走完至少一次樣品流程（出貨/追蹤中/已成交）的客戶，
// 全新客戶或還在挑產品線階段的客戶，不會被當成「文字下單」判斷，避免誤判。
const REPEAT_CUSTOMER_STAGES = ['shipped', 'tracking', 'won'];

function isRepeatCustomer(customer) {
  return !!customer && REPEAT_CUSTOMER_STAGES.includes(customer.stage);
}

// 下單語意關鍵字（口語化下單、付款方式用詞）
const ORDER_KEYWORDS = [
  '下單', '訂購', '叫貨', '進貨', '補貨', '要訂', '要叫',
  '老樣子', '跟上次一樣', '跟之前一樣',
  '貨到付款', '月結', '匯款', '轉帳', '統編', '要出貨',
];

// 數量 + 單位（例如「麻辣醬 5 包」「10 斤」），常見於下單但不一定會用到「下單」兩個字
const QUANTITY_PATTERN = /\d+\s*(斤|包|箱|桶|公斤|kg|瓶|盒|組|罐|份)/;

// 金額語意（例如「$500」「500元」），搭配其他條件時可提高信心
const AMOUNT_PATTERN = /(\$|NT\$)\s*\d+|\d+\s*元/;

function isLikelyOrderMessage(text) {
  if (!text) return false;
  const t = text.trim();
  if (ORDER_KEYWORDS.some((kw) => t.includes(kw))) return true;
  if (QUANTITY_PATTERN.test(t)) return true;
  if (AMOUNT_PATTERN.test(t) && t.length <= 60) return true; // 金額+短訊息，避免誤判長篇閒聊
  return false;
}

module.exports = {
  isRepeatCustomer,
  isLikelyOrderMessage,
};
