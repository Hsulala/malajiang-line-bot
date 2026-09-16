// 產品線話術與樣品清單設定
// 這個檔案集中管理機器人講的所有話術，之後要改文案只需要改這裡，不用動邏輯程式碼。
//
// 「中藥材」這條線目前心智圖裡還沒有詳細話術，先用 [TODO] 標記預設文字，
// 之後補齊真正的樣品清單/話術，直接改這個檔案裡對應的欄位即可，不需要重新部署程式邏輯結構。

const WELCOME_MESSAGE =
  '◆ 歡迎光臨 麻辣醬工廠 ◆\n' +
  '我們本身能做的服務有這些：\n' +
  '◆ 各式乾辣椒、中藥材、濃縮高湯\n' +
  '◆ 麻辣醬、辣椒醬、高湯粉代工\n' +
  '◆ 冷凍調理包、常溫調理包\n' +
  '◆ 玻璃罐(170g~500g裝)\n\n' +
  '你再跟我說一下，你想要做什麼樣的產品？';

const FALLBACK_MESSAGE =
  '不好意思，我沒有聽懂唷～\n' +
  '可以先跟我說說你想做「麻辣醬」還是「中藥材」相關的產品嗎？';

const GENERIC_REPLY_ACK = '收到您的訊息囉，謝謝您～有任何問題都可以再跟我說！';

const PRODUCT_LINES = {
  malajiang: {
    key: 'malajiang',
    label: '麻辣醬',
    triggerKeywords: ['麻辣醬', '麻辣', '辣醬', '醬料'],
    introMessage:
      '好的～針對麻辣醬，我們開發滿多味道。\n' +
      '樣品有：粉麻辣醬、粉蒙古麻辣醬、川味麻辣醬、油潑辣子、辣渣、椒麻醬、麻辣川油、黑豆瓣醬、滷包⋯\n' +
      '都是 200g 裝，正常 7 樣收 $200(貨到付款，含運)。',
    samples: [
      '粉麻辣醬',
      '粉蒙古麻辣醬',
      '川味麻辣醬',
      '油潑辣子',
      '辣渣',
      '椒麻醬',
      '麻辣川油',
      '黑豆瓣醬',
      '滷包',
    ],
    shippedMessage:
      '【出貨通知】已為您安排出貨：\n{{shippingNote}}\n' +
      '樣品箱較小會分兩件寄送，僅收一次費用唷～',
    d2Message: '請問一下唷，後來樣品都有收到嗎？\n（如果沒收到濃縮高湯，就不會有便利袋唷）',
    d16Message:
      '麻辣醬跟麻辣醬粉的差異，就是麻辣醬粉已經將辛香料磨成粉，所以不會有辛香料浮起來⋯兩款可以按比例混用，或單用其中一款唷。\n' +
      '老闆想請您試看看這些樣品，看有沒有喜歡的品項～\n' +
      '不急，中間有任何問題都可以跟我說唷！',
  },

  herb: {
    key: 'herb',
    label: '中藥材',
    triggerKeywords: ['中藥材', '中藥', '藥材', '中藥包'],
    // [TODO] 以下為預設佔位文字，請依實際樣品項目與報價補齊
    introMessage:
      '[TODO：中藥材產品線話術待補]\n' +
      '好的～針對中藥材相關產品，我們也有提供代工服務，實際樣品項目與報價之後補上。',
    samples: ['[TODO：中藥材樣品項目1]', '[TODO：中藥材樣品項目2]'],
    shippedMessage: '【出貨通知】已為您安排出貨：\n{{shippingNote}}',
    d2Message: '[TODO：中藥材 D+2 話術待補] 請問樣品都有收到嗎？',
    d16Message: '[TODO：中藥材 D+16 話術待補] 想請您試看看樣品，看有沒有喜歡的品項～',
  },
};

function matchProductLine(text) {
  if (!text) return null;
  const t = text.trim();
  for (const key of Object.keys(PRODUCT_LINES)) {
    const line = PRODUCT_LINES[key];
    if (line.triggerKeywords.some((kw) => t.includes(kw))) {
      return line;
    }
  }
  return null;
}

module.exports = {
  WELCOME_MESSAGE,
  FALLBACK_MESSAGE,
  GENERIC_REPLY_ACK,
  PRODUCT_LINES,
  matchProductLine,
};
