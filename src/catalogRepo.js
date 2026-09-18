// 資料存取層：商品目錄（母目錄）catalog_items
// 這是工廠完整批發品項清單，價格/品名都存在資料庫，後台可以直接編輯，不寫死在程式碼裡。
const db = require('./db');

async function listActive() {
  const r = await db.query(
    'SELECT * FROM catalog_items WHERE is_active = true ORDER BY category, sort_order, id'
  );
  return r.rows;
}

/** 後台管理用：含已下架的品項一起列出 */
async function listAll() {
  const r = await db.query('SELECT * FROM catalog_items ORDER BY category, sort_order, id');
  return r.rows;
}

async function getByIds(ids) {
  if (!ids || !ids.length) return [];
  const r = await db.query('SELECT * FROM catalog_items WHERE id = ANY($1::int[])', [ids]);
  return r.rows;
}

async function getByNames(names) {
  if (!names || !names.length) return [];
  const r = await db.query('SELECT * FROM catalog_items WHERE name = ANY($1::text[])', [names]);
  return r.rows;
}

async function create({ category, name, spec, unitPrice, priceUnit, sortOrder }) {
  const r = await db.query(
    `INSERT INTO catalog_items (category, name, spec, unit_price, price_unit, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [category, name, spec || null, unitPrice ?? null, priceUnit || '', sortOrder || 0]
  );
  return r.rows[0];
}

async function update(id, { category, name, spec, unitPrice, priceUnit, isActive, sortOrder }) {
  const r = await db.query(
    `UPDATE catalog_items
     SET category=$1, name=$2, spec=$3, unit_price=$4, price_unit=$5,
         is_active=$6, sort_order=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [category, name, spec || null, unitPrice ?? null, priceUnit || '', isActive !== false, sortOrder || 0, id]
  );
  return r.rows[0] || null;
}

async function setActive(id, isActive) {
  const r = await db.query(
    'UPDATE catalog_items SET is_active=$1, updated_at=now() WHERE id=$2 RETURNING *',
    [isActive, id]
  );
  return r.rows[0] || null;
}

/** 批次匯入（一次性建立初始批發目錄用），用 category+name+spec 判斷是否已存在，避免重複匯入 */
async function bulkImport(items) {
  let inserted = 0;
  let skipped = 0;
  for (const it of items || []) {
    const exists = await db.query(
      'SELECT id FROM catalog_items WHERE category=$1 AND name=$2 AND COALESCE(spec,\'\')=COALESCE($3,\'\')',
      [it.category, it.name, it.spec || null]
    );
    if (exists.rows.length) {
      skipped += 1;
      continue;
    }
    await db.query(
      `INSERT INTO catalog_items (category, name, spec, unit_price, price_unit, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [it.category, it.name, it.spec || null, it.unitPrice ?? null, it.priceUnit || '', it.sortOrder || 0]
    );
    inserted += 1;
  }
  return { inserted, skipped };
}

module.exports = {
  listActive,
  listAll,
  getByIds,
  getByNames,
  create,
  update,
  setActive,
  bulkImport,
};
