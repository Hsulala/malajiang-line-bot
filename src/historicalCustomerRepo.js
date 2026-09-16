// 資料存取層：從歷史 LINE 對話匯入的舊客戶紀錄（historical_customers）
// 這張表跟正式的 customers 看板完全獨立，純粹提供老闆查閱/搜尋參考用。
const db = require('./db');

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

async function listHistoricalCustomers({ q, page, pageSize } = {}) {
  const size = Math.min(Number(pageSize) || PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
  const pg = Math.max(Number(page) || 1, 1);
  const offset = (pg - 1) * size;

  const params = [];
  let where = '';
  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    where = `WHERE display_name ILIKE $1 OR store_name ILIKE $1 OR contact_name ILIKE $1
             OR phone ILIKE $1 OR address ILIKE $1 OR summary ILIKE $1`;
  }

  const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM historical_customers ${where}`, params);
  const total = countRes.rows[0].total;

  params.push(size, offset);
  const rowsRes = await db.query(
    `SELECT * FROM historical_customers ${where}
     ORDER BY last_contact_at DESC NULLS LAST, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: rowsRes.rows, total, page: pg, pageSize: size };
}

/** 批次匯入，一次呼叫可以帶多筆，方便從匯出的資料分批寫入 */
async function bulkInsert(records) {
  if (!records || !records.length) return { inserted: 0 };
  const cols = [
    'display_name', 'store_name', 'contact_name', 'phone', 'address',
    'product_interest', 'tag', 'likely_ordered', 'message_count',
    'first_contact_at', 'last_contact_at', 'summary', 'source_file',
  ];
  const values = [];
  const placeholders = [];
  records.forEach((r, i) => {
    const base = i * cols.length;
    placeholders.push('(' + cols.map((_, j) => `$${base + j + 1}`).join(',') + ')');
    values.push(
      r.display_name || null,
      r.store_name || null,
      r.contact_name || null,
      r.phone || null,
      r.address || null,
      r.product_interest || null,
      r.tag || null,
      !!r.likely_ordered,
      Number(r.message_count) || 0,
      r.first_contact_at || null,
      r.last_contact_at || null,
      r.summary || null,
      r.source_file || null
    );
  });
  const sql = `INSERT INTO historical_customers (${cols.join(',')}) VALUES ${placeholders.join(',')}`;
  await db.query(sql, values);
  return { inserted: records.length };
}

async function countHistoricalCustomers() {
  const r = await db.query('SELECT COUNT(*)::int AS total FROM historical_customers');
  return r.rows[0].total;
}

module.exports = {
  listHistoricalCustomers,
  bulkInsert,
  countHistoricalCustomers,
};
