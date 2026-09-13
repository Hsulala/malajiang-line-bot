const express = require('express');
const config = require('./config');
const line = require('./lineClient');
const repo = require('./customerRepo');
const { PRODUCT_LINES } = require('./productLines');

const router = express.Router();

// 提供前端 LIFF 頁面需要的公開設定（LIFF ID、各產品線樣品清單）
router.get('/api/liff/config', (req, res) => {
  res.json({
    liffId: config.line.liffId,
    productLines: Object.fromEntries(
      Object.entries(PRODUCT_LINES).map(([key, v]) => [key, { label: v.label, samples: v.samples }])
    ),
  });
});

router.post('/api/liff/submit', express.json(), async (req, res) => {
  try {
    const { idToken, storeName, contactName, phone, address, samples, interestLine } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ ok: false, error: '缺少 idToken，請確認是從 LINE 內的 LIFF 開啟表單' });
    }
    if (!storeName || !contactName || !phone || !address) {
      return res.status(400).json({ ok: false, error: '店名、聯絡人、電話、地址為必填' });
    }

    let verified;
    try {
      verified = await line.verifyIdToken(idToken);
    } catch (err) {
      console.error('[liff] idToken 驗證失敗', err.response ? err.response.data : err.message);
      return res.status(401).json({ ok: false, error: 'LINE 身分驗證失敗，請重新從聊天室開啟表單' });
    }

    const lineUserId = verified.sub;
    const customer = await repo.ensureCustomerByLineUserId(lineUserId, verified.name || null);

    if (interestLine && PRODUCT_LINES[interestLine]) {
      await repo.setInterestLine(customer.id, interestLine, PRODUCT_LINES[interestLine].label);
    }

    const cleanSamples = Array.isArray(samples) ? samples.filter(Boolean) : [];
    await repo.submitLiffForm(customer.id, { storeName, contactName, phone, address, samples: cleanSamples });

    // 通知老闆有新客戶完成表單，等待確認訂單
    if (config.line.ownerUserId) {
      const sampleText = cleanSamples.length ? cleanSamples.join('、') : '(未選擇樣品)';
      await line.pushMessage(config.line.ownerUserId, [
        line.textMessage(
          `🆕 新客戶完成表單，待您確認訂單\n` +
            `店名：${storeName}\n聯絡人：${contactName}\n電話：${phone}\n地址：${address}\n` +
            `想試樣品：${sampleText}\n\n請至後台管理系統確認訂單並安排出貨。`
        ),
      ]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[liff] 表單送出處理失敗', err);
    res.status(500).json({ ok: false, error: '伺服器錯誤，請稍後再試' });
  }
});

module.exports = router;
