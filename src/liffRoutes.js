const express = require('express');
const config = require('./config');
const line = require('./lineClient');
const repo = require('./customerRepo');
const templateRepo = require('./sampleTemplateRepo');
const catalogRepo = require('./catalogRepo');
const { RECEIVED_MESSAGE_TEMPLATE } = require('./productLines');

const router = express.Router();

// 提供前端 LIFF 頁面需要的公開設定（LIFF ID、指定樣品模板的候選品項清單）
router.get('/api/liff/config', async (req, res) => {
  try {
    const lineKey = req.query.line || '';
    const templates = await templateRepo.listActive();
    const template = templates.find((t) => t.key === lineKey) || templates[0];
    if (!template) {
      return res.json({
        ok: true,
        liffId: config.line.liffId,
        maxSamples: templateRepo.MAX_CUSTOMER_SELECTABLE,
        template: null,
        items: [],
      });
    }
    const items = await templateRepo.listTemplateItems(template.id);
    res.json({
      ok: true,
      liffId: config.line.liffId,
      maxSamples: templateRepo.MAX_CUSTOMER_SELECTABLE,
      template: { key: template.key, label: template.label },
      items: items.map((it) => ({
        id: it.id,
        name: it.name,
        spec: it.spec,
      })),
    });
  } catch (err) {
    console.error('[liff] 讀取設定失敗', err);
    res.status(500).json({ ok: false, error: '讀取設定失敗' });
  }
});

router.post('/api/liff/submit', express.json(), async (req, res) => {
  try {
    const { idToken, storeName, contactName, phone, address, catalogItemIds, interestLine } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ ok: false, error: '缺少 idToken，請確認是從 LINE 內的 LIFF 開啟表單' });
    }
    if (!storeName || !contactName || !phone || !address) {
      return res.status(400).json({ ok: false, error: '店名、聯絡人、電話、地址為必填' });
    }

    const ids = Array.isArray(catalogItemIds) ? catalogItemIds.map(Number).filter(Boolean) : [];
    if (ids.length > templateRepo.MAX_CUSTOMER_SELECTABLE) {
      return res
        .status(400)
        .json({ ok: false, error: `最多只能選擇 ${templateRepo.MAX_CUSTOMER_SELECTABLE} 樣品項` });
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

    let templateLabel = interestLine || '';
    if (interestLine) {
      const template = await templateRepo.getByKey(interestLine);
      if (template) {
        templateLabel = template.label;
        await repo.setInterestLine(customer.id, template.key, template.label);
      }
    }

    const catalogItems = await catalogRepo.getByIds(ids);
    const samples = catalogItems.map((it) => ({ catalogItemId: it.id, name: it.name }));
    await repo.submitLiffForm(customer.id, { storeName, contactName, phone, address, samples });

    // 回傳收件確認給客戶本人，讓他知道系統已經收到，避免因為 LIFF 視窗關掉後聊天室沒有留下任何訊息、
    // 客戶不確定有沒有送出成功而重複詢問。這則跟下面通知老闆的訊息是分開推播的兩則。
    await line.pushMessage(lineUserId, [line.textMessage(RECEIVED_MESSAGE_TEMPLATE)]);

    // 通知老闆有新客戶完成表單，等待確認訂單
    if (config.line.ownerUserId) {
      const sampleText = samples.length ? samples.map((s) => s.name).join('、') : '(未選擇樣品)';
      await line.pushMessage(config.line.ownerUserId, [
        line.textMessage(
          `【新客戶完成表單】待您確認訂單\n` +
            `類型：${templateLabel || '(未分類)'}\n` +
            `店名：${storeName}\n聯絡人：${contactName}\n電話：${phone}\n地址：${address}\n` +
            `想試樣品：${sampleText}\n\n請至後台管理系統確認訂單並安排出貨（可在確認前加碼其他品項）。`
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
