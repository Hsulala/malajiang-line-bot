const express = require('express');
const config = require('./config');
const auth = require('./adminAuth');
const repo = require('./customerRepo');
const orderRepo = require('./orderRepo');
const faqRepo = require('./faqRepo');
const line = require('./lineClient');
const { PRODUCT_LINES } = require('./productLines');

const router = express.Router();
router.use(express.json());

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
    const { category, question, answer, keywords, isActive, autoReply } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ ok: false, error: '請填寫問題與答案' });
    }
    const faq = await faqRepo.createFaq({ category, question, answer, keywords, isActive, autoReply });
    res.json({ ok: true, faq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '新增問答失敗' });
  }
});

router.patch('/api/admin/faqs/:id', async (req, res) => {
  try {
    const { category, question, answer, keywords, isActive, autoReply } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ ok: false, error: '請填寫問題與答案' });
    }
    const faq = await faqRepo.updateFaq(req.params.id, { category, question, answer, keywords, isActive, autoReply });
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

module.exports = router;
