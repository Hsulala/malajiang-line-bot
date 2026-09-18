// 資料存取層：樣品模板 sample_templates / sample_template_items
// 取代原本寫死在 productLines.js 裡的「麻辣醬／中藥材」兩條線，改成依店家類型
// （火鍋店/鍋燒麵店/牛肉麵店...）各自一份話術 + 建議樣品清單，全部後台可編輯。
const db = require('./db');

const MAX_CUSTOMER_SELECTABLE = 7; // 客戶在 LIFF 表單最多可以勾選的樣品數

async function listActive() {
  const r = await db.query(
    'SELECT * FROM sample_templates WHERE is_active = true ORDER BY sort_order, id'
  );
  return r.rows;
}

/** 後台管理用：含已下架的模板一起列出 */
async function listAll() {
  const r = await db.query('SELECT * FROM sample_templates ORDER BY sort_order, id');
  return r.rows;
}

async function getByKey(key) {
  const r = await db.query('SELECT * FROM sample_templates WHERE key = $1', [key]);
  return r.rows[0] || null;
}

async function getById(id) {
  const r = await db.query('SELECT * FROM sample_templates WHERE id = $1', [id]);
  return r.rows[0] || null;
}

/** 這個模板的候選品項（含商品目錄詳細資料），依 sort_order 排序 */
async function listTemplateItems(templateId) {
  const r = await db.query(
    `SELECT ci.*, sti.sort_order AS template_sort_order
     FROM sample_template_items sti
     JOIN catalog_items ci ON ci.id = sti.catalog_item_id
     WHERE sti.template_id = $1 AND ci.is_active = true
     ORDER BY sti.sort_order, ci.id`,
    [templateId]
  );
  return r.rows;
}

/** 依客戶輸入文字比對模板：label 本身自動視為關鍵字，不用在 trigger_keywords 裡重複填 */
async function matchTemplate(text) {
  if (!text) return null;
  const t = text.trim();
  const templates = await listActive();
  for (const tpl of templates) {
    const keywords = (tpl.trigger_keywords || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    keywords.push(tpl.label);
    if (keywords.some((kw) => t.includes(kw))) {
      return tpl;
    }
  }
  return null;
}

async function create({ key, label, triggerKeywords, introMessage, d2Message, d16Message, sortOrder }) {
  const r = await db.query(
    `INSERT INTO sample_templates (key, label, trigger_keywords, intro_message, d2_message, d16_message, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [key, label, triggerKeywords || '', introMessage || '', d2Message || '', d16Message || '', sortOrder || 0]
  );
  return r.rows[0];
}

async function update(id, { label, triggerKeywords, introMessage, d2Message, d16Message, isActive, sortOrder }) {
  const r = await db.query(
    `UPDATE sample_templates
     SET label=$1, trigger_keywords=$2, intro_message=$3, d2_message=$4, d16_message=$5,
         is_active=$6, sort_order=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [label, triggerKeywords || '', introMessage || '', d2Message || '', d16Message || '', isActive !== false, sortOrder || 0, id]
  );
  return r.rows[0] || null;
}

async function setActive(id, isActive) {
  const r = await db.query(
    'UPDATE sample_templates SET is_active=$1, updated_at=now() WHERE id=$2 RETURNING *',
    [isActive, id]
  );
  return r.rows[0] || null;
}

/** 覆蓋整份候選品項清單（超級管理者在後台勾選商品目錄品項時用） */
async function setTemplateItems(templateId, catalogItemIds) {
  await db.query('DELETE FROM sample_template_items WHERE template_id=$1', [templateId]);
  const ids = Array.from(new Set(catalogItemIds || []));
  for (let i = 0; i < ids.length; i += 1) {
    await db.query(
      'INSERT INTO sample_template_items (template_id, catalog_item_id, sort_order) VALUES ($1,$2,$3)',
      [templateId, ids[i], i]
    );
  }
}

/** 批次匯入（一次性建立初始樣品模板用），依 catalog_items.name 找出對應的商品目錄 id */
async function bulkImport(templates) {
  let created = 0;
  let skipped = 0;
  for (const t of templates || []) {
    const exists = await getByKey(t.key);
    if (exists) {
      skipped += 1;
      continue;
    }
    const tpl = await create({
      key: t.key,
      label: t.label,
      triggerKeywords: t.triggerKeywords,
      introMessage: t.introMessage,
      d2Message: t.d2Message,
      d16Message: t.d16Message,
      sortOrder: t.sortOrder,
    });
    if (t.sampleItemNames && t.sampleItemNames.length) {
      const catalogRepo = require('./catalogRepo');
      const items = await catalogRepo.getByNames(t.sampleItemNames);
      const orderedIds = t.sampleItemNames
        .map((name) => items.find((it) => it.name === name))
        .filter(Boolean)
        .map((it) => it.id);
      await setTemplateItems(tpl.id, orderedIds);
    }
    created += 1;
  }
  return { created, skipped };
}

module.exports = {
  MAX_CUSTOMER_SELECTABLE,
  listActive,
  listAll,
  getByKey,
  getById,
  listTemplateItems,
  matchTemplate,
  create,
  update,
  setActive,
  setTemplateItems,
  bulkImport,
};
