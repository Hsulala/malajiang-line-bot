const express = require('express');
const config = require('./config');
const line = require('./lineClient');
const repo = require('./customerRepo');
const { WELCOME_MESSAGE, FALLBACK_MESSAGE, GENERIC_REPLY_ACK, PRODUCT_LINES, matchProductLine } = require('./productLines');

const router = express.Router();

/**
 * LINE 簽章驗證中介層。
 * 需要 req.rawBody（在 server.js 用 express.json 的 verify 選項存下原始 body）。
 */
function verifyLineSignature(req, res, next) {
  const signature = req.get('x-line-signature');
  if (!line.verifySignature(req.rawBody, signature)) {
    console.warn('[webhook] 簽章驗證失敗，拒絕請求');
    return res.status(401).send('signature validation failed');
  }
  next();
}

router.post('/webhook', verifyLineSignature, (req, res) => {
  // 依 LINE 官方建議：先立即回 200，事件用非同步處理，避免重試風暴
  res.status(200).end();
  const events = (req.body && req.body.events) || [];
  events.forEach((event) => {
    handleEvent(event).catch((err) => {
      console.error('[webhook] 事件處理失敗', err);
    });
  });
});

function buildLiffUrl(lineKey) {
  return `https://liff.line.me/${config.line.liffId}?line=${encodeURIComponent(lineKey)}`;
}

async function handleEvent(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return; // 群組/聊天室事件先忽略，只處理一對一好友對話

  if (event.type === 'follow') {
    await repo.ensureCustomerByLineUserId(userId, null);
    await line.replyMessage(event.replyToken, [
      line.textMessage(WELCOME_MESSAGE, ['麻辣醬', '中藥材']),
    ]);
    return;
  }

  if (event.type === 'unfollow') {
    // 客戶封鎖/刪除好友，暫不特別處理，保留歷史資料即可
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text || '';
    const customer = await repo.ensureCustomerByLineUserId(userId, null);
    const productLine = matchProductLine(text);

    if (productLine) {
      await repo.setInterestLine(customer.id, productLine.key, productLine.label);
      const liffUrl = buildLiffUrl(productLine.key);
      await line.replyMessage(event.replyToken, [
        line.textMessage(productLine.introMessage),
        line.liffLinkMessage(
          '請點此填寫收件資料與想試的品項',
          '📋 開啟樣品申請表單',
          liffUrl
        ),
      ]);
      return;
    }

    // 不是選擇產品線的關鍵字 -> 檢查是不是在回覆 D+2 / D+16 追蹤訊息
    const awaiting = await repo.findAwaitingReplyFollowup(customer.id);
    if (awaiting) {
      await repo.recordFollowupReply(awaiting.id, text);
      await repo.addTimelineEvent(
        customer.id,
        `${awaiting.followup_type === 'd2' ? 'D+2' : 'D+16'} 客戶回覆：${text}`
      );
      // 轉知老闆，讓老闆知道有客戶回覆了追蹤訊息
      if (config.line.ownerUserId) {
        await line.pushMessage(config.line.ownerUserId, [
          line.textMessage(
            `📩 客戶回覆通知\n店家：${customer.store_name || customer.display_name || '(尚未填寫店名)'}\n內容：${text}`
          ),
        ]);
      }
      await line.replyMessage(event.replyToken, [line.textMessage(GENERIC_REPLY_ACK)]);
      return;
    }

    // 其他情況：不認識的輸入，導回主選單
    await line.replyMessage(event.replyToken, [
      line.textMessage(FALLBACK_MESSAGE, ['麻辣醬', '中藥材']),
    ]);
    return;
  }

  // 其他訊息類型(貼圖/圖片等)先不特別處理
}

module.exports = router;
