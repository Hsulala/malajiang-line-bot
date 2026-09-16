const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const auth = require('./adminAuth');
const repo = require('./customerRepo');
const orderRepo = require('./orderRepo');
const faqRepo = require('./faqRepo');
const historicalRepo = require('./historicalCustomerRepo');
const line = require('./lineClient');
const { PRODUCT_LINES } = require('./productLines');

const router = express.Router();
// limit 調高是因為「歷史客戶紀錄」批次匯入一次會帶較多筆資料
router.use(express.json({ limit: '20mb' }));

// ---- 登入 / 登出 ----
router.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== config.admin.password) {
    return res.status(401).json({ ok: false, error: '密碼錯誤' });
  }
  const token = auth.issueToken();
  auth.setAuthCookie(res, token);
  res.json({ ok: true });
});

router.post('/api/admin/logout', (req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/api/admin/me', auth.requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// ---- 以下都需要登入 ----
router.use('/api/admin', auth.requireAdmin);

router.get('/api/admin/customers', async (req, res) => {
  try {
    const customers = await repo.listCustomersWithSummary();
    res.json({ ok: true, customers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取客戶列表失敗' });
  }
});

router.get('/api/admin/customers/:id', async (req, res) => {
  try {
    const detail = await repo.getCustomerDetail(req.params.id);
    if (!detail) return res.status(404).json({ ok: false, error: '找不到這位客戶' });
    res.json({ ok: true, customer: detail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取客戶詳細資料失敗' });
  }
});

// 手動變更階段（例如標記為已成交 won / 結案 closed，或退回前一階段）
router.patch('/api/admin/customers/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body || {};
    if (!repo.STAGES.includes(stage)) {
      return res.status(400).json({ ok: false, error: '不合法的階段' });
    }
    await repo.updateStage(req.params.id, stage);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '更新階段失敗' });
  }
});

// 老闆確認訂單：設定出貨日 -> 觸發出貨通知給客戶 + 建立 D+2/D+16 排程
router.post('/api/admin/customers/:id/confirm-order', async (req, res) => {
  try {
    const customer = await repo.getById(req.params.id);
    if (!customer) return res.status(404).json({ ok: false, error: '找不到這位客戶' });

    const shippedAt = (req.body && req.body.shippedAt) || new Date().toISOString().slice(0, 10);
    const shippingNote = (req.body && req.body.shippingNote) || '';

    await repo.confirmOrder(customer.id, { shippedAt, shippingNote });

    const lineDef = PRODUCT_LINES[customer.interest_line] || PRODUCT_LINES.malajiang;
    const text = lineDef.shippedMessage.replace(
      '{{shippingNote}}',
      shippingNote || '樣品已為您安排出貨'
    );
    await line.pushMessage(customer.line_user_id, [line.textMessage(text)]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '確認訂單失敗' });
  }
});

// 老闆備註
router.post('/api/admin/customers/:id/note', async (req, res) => {
  try {
    const { note } = req.body || {};
    await repo.updateNote(req.params.id, note || '');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '儲存備註失敗' });
  }
});

// 標記目前的追蹤排程為已處理（不用等自動排程，也不會再發送這一筆）
router.post('/api/admin/customers/:id/mark-processed', async (req, res) => {
  try {
    await repo.markLatestFollowupHandled(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '標記失敗' });
  }
});

// ---- 熟客文字下單記錄 ----
router.get('/api/admin/orders', async (req, res) => {
  try {
    const status = req.query.status || null;
    const orders = await orderRepo.listOrderMessages(status);
    res.json({ ok: true, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取訂單記錄失敗' });
  }
});

router.post('/api/admin/orders/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body || {};
    const updated = await orderRepo.updateOrderMessageStatus(req.params.id, status, note);
    if (!updated) return res.status(404).json({ ok: false, error: '找不到這筆訂單記錄' });
    res.json({ ok: true, order: updated });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message || '更新訂單記錄失敗' });
  }
});

// ---- FAQ / 知識庫 ----
router.get('/api/admin/faqs', async (req, res) => {
  try {
    const faqs = await faqRepo.listFaqs();
    res.json({ ok: true, faqs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取知識庫失敗' });
  }
});

router.post('/api/admin/faqs', async (req, res) => {
  try {
    const { category, question, answer, keywords, isActive, autoReply, internalNote } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ ok: false, error: '請填寫問題與答案' });
    }
    const faq = await faqRepo.createFaq({ category, question, answer, keywords, isActive, autoReply, internalNote });
    res.json({ ok: true, faq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '新增問答失敗' });
  }
});

router.patch('/api/admin/faqs/:id', async (req, res) => {
  try {
    const { category, question, answer, keywords, isActive, autoReply, internalNote } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ ok: false, error: '請填寫問題與答案' });
    }
    const faq = await faqRepo.updateFaq(req.params.id, { category, question, answer, keywords, isActive, autoReply, internalNote });
    if (!faq) return res.status(404).json({ ok: false, error: '找不到這則問答' });
    res.json({ ok: true, faq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '更新問答失敗' });
  }
});

router.delete('/api/admin/faqs/:id', async (req, res) => {
  try {
    await faqRepo.deleteFaq(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '刪除問答失敗' });
  }
});

// ---- 歷史客戶紀錄（從過往 LINE 對話匯入，僅供查閱搜尋，跟正式看板分開） ----
router.get('/api/admin/historical-customers', async (req, res) => {
  try {
    const { q, page, pageSize } = req.query;
    const result = await historicalRepo.listHistoricalCustomers({ q, page, pageSize });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取歷史客戶紀錄失敗' });
  }
});

// 一次性匯入資料的來源檔案（僅供老闆登入後讀取，不是公開靜態檔案，因為裡面含有客戶電話/地址）
// data-import/ 目錄不在 public/ 底下、也不會被 express.static 提供，只能透過這個有登入驗證的路由讀取。
router.get('/api/admin/import-data/:name', (req, res) => {
  const allowed = ['historical_customers.json', 'faqs_seed.json'];
  if (!allowed.includes(req.params.name)) {
    return res.status(404).json({ ok: false, error: '找不到這個檔案' });
  }
  const filePath = path.join(__dirname, '..', 'data-import', req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: '檔案不存在' });
  }
  res.sendFile(filePath);
});

// 批次匯入（供一次性資料匯入使用，可分批呼叫）
router.post('/api/admin/historical-customers/import', async (req, res) => {
  try {
    const { records } = req.body || {};
    if (!Array.isArray(records) || !records.length) {
      return res.status(400).json({ ok: false, error: '缺少 records 陣列' });
    }
    const result = await historicalRepo.bulkInsert(records);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '匯入失敗' });
  }
});

module.exports = router;
