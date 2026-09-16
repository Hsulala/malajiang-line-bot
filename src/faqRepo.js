// 資料存取層：FAQ / 知識庫（faqs）
const db = require('./db');

function parseKeywords(keywordsStr) {
  return String(keywordsStr || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

async function listFaqs() {
  const r = await db.query('SELECT * FROM faqs ORDER BY category NULLS LAST, id ASC');
  return r.rows;
}

/** 給機器人用：只抓「有開自動回覆」且「啟用中」的 FAQ */
async function listActiveAutoReplyFaqs() {
  const r = await db.query(
    'SELECT * FROM faqs WHERE is_active = true AND auto_reply = true ORDER BY id ASC'
  );
  return r.rows;
}

async function createFaq({ category, question, answer, keywords, isActive, autoReply, internalNote }) {
  const r = await db.query(
    `INSERT INTO faqs (category, question, answer, keywords, is_active, auto_reply, internal_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      category || null,
      question,
      answer,
      keywords || '',
      isActive !== false,
      !!autoReply,
      internalNote || null,
    ]
  );
  return r.rows[0];
}

async function updateFaq(id, { category, question, answer, keywords, isActive, autoReply, internalNote }) {
  const r = await db.query(
    `UPDATE faqs SET
       category=$1, question=$2, answer=$3, keywords=$4,
       is_active=$5, auto_reply=$6, internal_note=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [
      category || null,
      question,
      answer,
      keywords || '',
      isActive !== false,
      !!autoReply,
      internalNote || null,
      id,
    ]
  );
  return r.rows[0] || null;
}

async function deleteFaq(id) {
  await db.query('DELETE FROM faqs WHERE id=$1', [id]);
}

/** 依文字內容比對是否命中某則「有開自動回覆」的 FAQ 關鍵字 */
function matchFaq(text, faqs) {
  if (!text) return null;
  const t = text.trim();
  for (const faq of faqs) {
    const keywords = parseKeywords(faq.keywords);
    if (keywords.some((kw) => t.includes(kw))) {
      return faq;
    }
  }
  return null;
}

module.exports = {
  listFaqs,
  listActiveAutoReplyFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  matchFaq,
  parseKeywords,
};
