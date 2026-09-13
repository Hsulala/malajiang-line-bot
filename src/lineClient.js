const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');

const client = axios.create({
  baseURL: 'https://api.line.me/v2/bot',
  headers: {
    Authorization: `Bearer ${config.line.channelAccessToken}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * 驗證 LINE Webhook 簽章（x-line-signature）
 * rawBody 必須是尚未被 JSON.parse 的原始 Buffer/字串
 */
function verifySignature(rawBody, signature) {
  if (!signature) return false;
  const hash = crypto
    .createHmac('sha256', config.line.channelSecret)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

/** 回覆訊息（只能在收到事件後 30 秒內、用同一個 replyToken 使用一次） */
async function replyMessage(replyToken, messages) {
  const msgs = Array.isArray(messages) ? messages : [messages];
  try {
    await client.post('/message/reply', { replyToken, messages: msgs });
  } catch (err) {
    logLineError('replyMessage', err);
  }
}

/** 主動推播訊息（用於排程追蹤、老闆通知等非即時回覆情境） */
async function pushMessage(toUserId, messages) {
  const msgs = Array.isArray(messages) ? messages : [messages];
  try {
    await client.post('/message/push', { to: toUserId, messages: msgs });
  } catch (err) {
    logLineError('pushMessage', err);
  }
}

function logLineError(fnName, err) {
  if (err.response) {
    console.error(`[lineClient] ${fnName} 失敗 status=${err.response.status}`, err.response.data);
  } else {
    console.error(`[lineClient] ${fnName} 失敗`, err.message);
  }
}

/** 產生一則文字訊息，可選擇附帶 quick reply 按鈕（點擊後會以文字訊息送出） */
function textMessage(text, quickReplyLabels) {
  const msg = { type: 'text', text };
  if (quickReplyLabels && quickReplyLabels.length) {
    msg.quickReply = {
      items: quickReplyLabels.map((label) => ({
        type: 'action',
        action: { type: 'message', label, text: label },
      })),
    };
  }
  return msg;
}

/** 產生一則帶按鈕連結到 LIFF 表單的訊息 */
function liffLinkMessage(promptText, buttonLabel, liffUrl) {
  return {
    type: 'template',
    altText: promptText,
    template: {
      type: 'buttons',
      text: promptText.slice(0, 160),
      actions: [{ type: 'uri', label: buttonLabel, uri: liffUrl }],
    },
  };
}

/**
 * 驗證 LIFF 前端送來的 idToken 是否合法、且屬於這個 Channel
 * 回傳 { sub, name } 或在驗證失敗時 throw
 */
async function verifyIdToken(idToken) {
  const resp = await axios.post(
    'https://api.line.me/oauth2/v2.1/verify',
    new URLSearchParams({
      id_token: idToken,
      client_id: config.line.channelId,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  );
  // resp.data: { iss, sub, aud, exp, iat, name, picture, ... }
  return resp.data;
}

module.exports = {
  verifySignature,
  replyMessage,
  pushMessage,
  textMessage,
  liffLinkMessage,
  verifyIdToken,
};
