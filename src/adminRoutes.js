const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./adminAuth');
const repo = require('./customerRepo');
const orderRepo = require('./orderRepo');
const faqRepo = require('./faqRepo');
const historicalRepo = require('./historicalCustomerRepo');
const catalogRepo = require('./catalogRepo');
const templateRepo = require('./sampleTemplateRepo');
const userRepo = require('./adminUserRepo');
const line = require('./lineClient');
const { SHIPPED_MESSAGE_TEMPLATE } = require('./productLines');

const router = express.Router();
// limit 調高是因為「歷史客戶紀錄」批次匯入一次會帶較多筆資料
router.use(express.json({ limit: '20mb' }));

// ---- 登入 / 登出 ----
// 每人一組自己的帳號密碼（admin_users），不再用共用密碼。角色分三層：
// staff（員工）/ admin（老闆，可管理 staff 帳號）/ superadmin（可管理所有帳號 + 商品目錄）。
router.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: '請輸入帳號與密碼' });
    }
    const user = await userRepo.findByUsername(String(username).trim());
    const ok = user && user.is_active && (await userRepo.verifyPassword(user, password));
    await db.query(
      'INSERT INTO admin_login_log (ip, success, username, admin_user_id) VALUES ($1,$2,$3,$4)',
      [ip, !!ok, username, user ? user.id : null]
    );
    if (!ok) {
      return res.status(401).json({ ok: false, error: '帳號或密碼錯誤' });
    }
    const token = auth.issueToken(user.id);
    auth.setAuthCookie(res, token);
    res.json({ ok: true, role: user.role, username: user.username, displayName: user.display_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '登入失敗' });
  }
});

router.post('/api/admin/logout', (req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

// 這個一次性路由只有在 admin_users 一個帳號都還沒有的時候才能用，用來建立第一批帳號
// （超級管理者 + 老闆），之後 admin_users 只要有任何一筆資料就會永久鎖住，避免被濫用。
router.post('/api/admin/bootstrap-accounts', async (req, res) => {
  try {
    const existing = await userRepo.count();
    if (existing > 0) {
      return res.status(403).json({ ok: false, error: '已經有帳號了，無法再次初始化' });
    }
    const { accounts } = req.body || {};
    if (!Array.isArray(accounts) || !accounts.length) {
      return res.status(400).json({ ok: false, error: '缺少 accounts 陣列' });
    }
    const created = [];
    for (const a of accounts) {
      if (!a.username || !a.password || !a.displayName || !a.role) {
        return res.status(400).json({ ok: false, error: '每個帳號都要有 username/password/displayName/role' });
      }
      const user = await userRepo.create({
        username: a.username,
        password: a.password,
        displayName: a.displayName,
        role: a.role,
      });
      created.push({ id: user.id, username: user.username, role: user.role });
    }
    res.json({ ok: true, created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '初始化帳號失敗（帳號可能重複）' });
  }
});

router.get('/api/admin/me', auth.requireAdmin, (req, res) => {
  res.json({
    ok: true,
    role: req.adminRole,
    username: req.adminUser.username,
    displayName: req.adminUser.display_name,
  });
});

// ---- 以下都需要登入 ----
router.use('/api/admin', auth.requireAdmin);

// ---- 帳號管理：admin（老闆）只能管 staff 帳號，superadmin 能管所有人 ----
router.get('/api/admin/accounts', auth.requireAccountManager, async (req, res) => {
  try {
    const all = await userRepo.listAll();
    const visible = req.adminRole === 'superadmin' ? all : all.filter((u) => u.role === 'staff');
    res.json({ ok: true, accounts: visible });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取帳號列表失敗' });
  }
});

router.post('/api/admin/accounts', auth.requireAccountManager, async (req, res) => {
  try {
    const { username, password, displayName } = req.body || {};
    let { role } = req.body || {};
    if (!username || !password || !displayName) {
      return res.status(400).json({ ok: false, error: '請填寫帳號、密碼與顯示名稱' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: '密碼至少要 6 碼' });
    }
    // 老闆（admin）只能開「員工」帳號，不能自己指定角色，也不能開出跟自己同級或更高權限的帳號
    if (req.adminRole === 'admin') {
      role = 'staff';
    } else if (!userRepo.ROLES.includes(role)) {
      return res.status(400).json({ ok: false, error: '不合法的角色' });
    }
    const user = await userRepo.create({ username, password, displayName, role, createdBy: req.adminUser.id });
    res.json({ ok: true, account: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '新增帳號失敗（帳號可能重複）' });
  }
});

router.patch('/api/admin/accounts/:id', auth.requireAccountManager, async (req, res) => {
  try {
    const target = await userRepo.getById(req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: '找不到這個帳號' });
    // 老闆（admin）只能動「員工」帳號，不能動其他 admin 或 superadmin 帳號（包含自己升降級）
    if (req.adminRole === 'admin' && target.role !== 'staff') {
      return res.status(403).json({ ok: false, error: '你只能管理員工帳號' });
    }
    const { displayName, isActive, role, newPassword } = req.body || {};
    // 不能把最後一個還在啟用中的超級管理者停用或降級，避免整個後台被鎖死
    if (target.role === 'superadmin' && (isActive === false || (role && role !== 'superadmin'))) {
      const others = await userRepo.countActiveSuperadmins(target.id);
      if (others === 0) {
        return res.status(400).json({ ok: false, error: '至少要留一位有效的超級管理者' });
      }
    }
    if (displayName !== undefined || isActive !== undefined) {
      await userRepo.updateProfile(target.id, { displayName, isActive });
    }
    if (role !== undefined) {
      if (req.adminRole !== 'superadmin') {
        return res.status(403).json({ ok: false, error: '只有超級管理者能調整角色' });
      }
      await userRepo.updateRole(target.id, role);
    }
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ ok: false, error: '密碼至少要 6 碼' });
      }
      await userRepo.resetPassword(target.id, newPassword);
    }
    const updated = await userRepo.getById(target.id);
    res.json({ ok: true, account: userRepo.sanitize(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '更新帳號失敗' });
  }
});

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

    const text = SHIPPED_MESSAGE_TEMPLATE.replace(
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

// 老闆「加碼」：從完整商品目錄勾選額外要送的樣品，跟客戶自己選的分開標記（一般管理者即可操作，不限超級管理者）
router.post('/api/admin/customers/:id/extra-samples', async (req, res) => {
  try {
    const { catalogItemIds } = req.body || {};
    const ids = Array.isArray(catalogItemIds) ? catalogItemIds.map(Number).filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ ok: false, error: '請選擇至少一項要加碼的品項' });
    }
    const items = await catalogRepo.getByIds(ids);
    await repo.addExtraSamples(
      req.params.id,
      items.map((it) => ({ catalogItemId: it.id, name: it.name }))
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '加碼失敗' });
  }
});

// 移除一筆樣品紀錄（客戶自選或老闆加碼的都可以移除，用來調整最終出貨清單）
router.delete('/api/admin/customers/:id/samples/:sampleId', async (req, res) => {
  try {
    await repo.removeSample(req.params.id, req.params.sampleId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '移除失敗' });
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
  const allowed = [
    'historical_customers.json',
    'faqs_seed.json',
    'catalog_seed.json',
    'sample_templates_seed.json',
  ];
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

// ---- 商品目錄（母目錄）：admin（老闆）與 superadmin 都能新增/編輯/下架，staff（員工）只能瀏覽 ----
router.get('/api/admin/catalog-items', async (req, res) => {
  try {
    const items = await catalogRepo.listAll();
    res.json({ ok: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取商品目錄失敗' });
  }
});

router.post('/api/admin/catalog-items', auth.requireCatalogManager, async (req, res) => {
  try {
    const { category, name, spec, unitPrice, priceUnit, sortOrder } = req.body || {};
    if (!category || !name) {
      return res.status(400).json({ ok: false, error: '請填寫分類與品名' });
    }
    const item = await catalogRepo.create({ category, name, spec, unitPrice, priceUnit, sortOrder });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '新增品項失敗' });
  }
});

router.patch('/api/admin/catalog-items/:id', auth.requireCatalogManager, async (req, res) => {
  try {
    const { category, name, spec, unitPrice, priceUnit, isActive, sortOrder } = req.body || {};
    if (!category || !name) {
      return res.status(400).json({ ok: false, error: '請填寫分類與品名' });
    }
    const item = await catalogRepo.update(req.params.id, {
      category,
      name,
      spec,
      unitPrice,
      priceUnit,
      isActive,
      sortOrder,
    });
    if (!item) return res.status(404).json({ ok: false, error: '找不到這個品項' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '更新品項失敗' });
  }
});

// 下架（不做實體刪除，避免舊訂單/樣品紀錄的關聯斷掉）
router.delete('/api/admin/catalog-items/:id', auth.requireCatalogManager, async (req, res) => {
  try {
    const item = await catalogRepo.setActive(req.params.id, false);
    if (!item) return res.status(404).json({ ok: false, error: '找不到這個品項' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '下架失敗' });
  }
});

router.post('/api/admin/catalog-items/import', auth.requireCatalogManager, async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: '缺少 items 陣列' });
    }
    const result = await catalogRepo.bulkImport(items);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '匯入失敗' });
  }
});

// ---- 樣品模板（店家類型 + 建議樣品清單）：admin（老闆）與 superadmin 都能新增/編輯/下架，staff（員工）只能瀏覽 ----
router.get('/api/admin/sample-templates', async (req, res) => {
  try {
    const templates = await templateRepo.listAll();
    const withItems = await Promise.all(
      templates.map(async (t) => ({
        ...t,
        items: await templateRepo.listTemplateItems(t.id),
      }))
    );
    res.json({ ok: true, templates: withItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '讀取樣品模板失敗' });
  }
});

router.post('/api/admin/sample-templates', auth.requireCatalogManager, async (req, res) => {
  try {
    const { key, label, triggerKeywords, introMessage, d2Message, d16Message, sortOrder, catalogItemIds } =
      req.body || {};
    if (!key || !label) {
      return res.status(400).json({ ok: false, error: '請填寫代碼與顯示名稱' });
    }
    const tpl = await templateRepo.create({
      key,
      label,
      triggerKeywords,
      introMessage,
      d2Message,
      d16Message,
      sortOrder,
    });
    if (Array.isArray(catalogItemIds) && catalogItemIds.length) {
      await templateRepo.setTemplateItems(tpl.id, catalogItemIds.map(Number));
    }
    res.json({ ok: true, template: tpl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '新增樣品模板失敗（代碼可能重複）' });
  }
});

router.patch('/api/admin/sample-templates/:id', auth.requireCatalogManager, async (req, res) => {
  try {
    const { label, triggerKeywords, introMessage, d2Message, d16Message, isActive, sortOrder, catalogItemIds } =
      req.body || {};
    if (!label) {
      return res.status(400).json({ ok: false, error: '請填寫顯示名稱' });
    }
    const tpl = await templateRepo.update(req.params.id, {
      label,
      triggerKeywords,
      introMessage,
      d2Message,
      d16Message,
      isActive,
      sortOrder,
    });
    if (!tpl) return res.status(404).json({ ok: false, error: '找不到這個模板' });
    if (Array.isArray(catalogItemIds)) {
      await templateRepo.setTemplateItems(tpl.id, catalogItemIds.map(Number));
    }
    res.json({ ok: true, template: tpl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '更新樣品模板失敗' });
  }
});

router.delete('/api/admin/sample-templates/:id', auth.requireCatalogManager, async (req, res) => {
  try {
    const tpl = await templateRepo.setActive(req.params.id, false);
    if (!tpl) return res.status(404).json({ ok: false, error: '找不到這個模板' });
    res.json({ ok: true, template: tpl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '下架失敗' });
  }
});

router.post('/api/admin/sample-templates/import', auth.requireCatalogManager, async (req, res) => {
  try {
    const { templates } = req.body || {};
    if (!Array.isArray(templates) || !templates.length) {
      return res.status(400).json({ ok: false, error: '缺少 templates 陣列' });
    }
    const result = await templateRepo.bulkImport(templates);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '匯入失敗' });
  }
});

module.exports = router;
