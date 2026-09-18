// 資料存取層：所有跟 customers / customer_samples / timeline_events / followups 有關的 SQL 都集中在這裡
const db = require('./db');

const STAGES = ['new', 'confirm', 'shipped', 'tracking', 'won', 'closed'];

async function addTimelineEvent(customerId, text) {
  await db.query(
    'INSERT INTO timeline_events (customer_id, event_text) VALUES ($1, $2)',
    [customerId, text]
  );
}

/** LINE 加好友(follow事件)時：確保這個 line_user_id 有一筆 customer 記錄 */
async function ensureCustomerByLineUserId(lineUserId, displayName) {
  const existing = await db.query('SELECT * FROM customers WHERE line_user_id = $1', [lineUserId]);
  if (existing.rows.length) {
    if (displayName && existing.rows[0].display_name !== displayName) {
      await db.query('UPDATE customers SET display_name=$1, updated_at=now() WHERE id=$2', [
        displayName,
        existing.rows[0].id,
      ]);
    }
    return existing.rows[0];
  }
  const inserted = await db.query(
    `INSERT INTO customers (line_user_id, display_name, stage) VALUES ($1, $2, 'new') RETURNING *`,
    [lineUserId, displayName || null]
  );
  await addTimelineEvent(inserted.rows[0].id, '客戶加入好友，機器人自動開場');
  return inserted.rows[0];
}

async function getByLineUserId(lineUserId) {
  const r = await db.query('SELECT * FROM customers WHERE line_user_id = $1', [lineUserId]);
  return r.rows[0] || null;
}

async function getById(id) {
  const r = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
  return r.rows[0] || null;
}

/** 客戶選擇了某條產品線（例如打「麻辣醬」）時更新興趣類別 */
async function setInterestLine(customerId, interestKey, label) {
  const c = await getById(customerId);
  let next = interestKey;
  if (c && c.interest_line && c.interest_line !== interestKey && c.interest_line !== 'multiple') {
    next = 'multiple';
  } else if (c && c.interest_line === 'multiple') {
    next = 'multiple';
  }
  await db.query('UPDATE customers SET interest_line=$1, updated_at=now() WHERE id=$2', [
    next,
    customerId,
  ]);
  await addTimelineEvent(customerId, `客戶選擇「${label}」，機器人送出樣品清單`);
}

/**
 * LIFF 表單送出：寫入店家資料、客戶勾選的樣品，並把 stage 推進到 confirm（待老闆確認）
 * samples: [{ catalogItemId, name }]，數量上限（目前 7 樣）在 liffRoutes 那層驗證
 */
async function submitLiffForm(customerId, { storeName, contactName, phone, address, samples }) {
  await db.query(
    `UPDATE customers
     SET store_name=$1, contact_name=$2, phone=$3, address=$4, stage='confirm', updated_at=now()
     WHERE id=$5`,
    [storeName, contactName, phone, address, customerId]
  );
  await db.query("DELETE FROM customer_samples WHERE customer_id=$1 AND added_by='customer'", [
    customerId,
  ]);
  for (const s of samples || []) {
    await db.query(
      `INSERT INTO customer_samples (customer_id, sample_name, catalog_item_id, added_by)
       VALUES ($1,$2,$3,'customer')`,
      [customerId, s.name, s.catalogItemId || null]
    );
  }
  await addTimelineEvent(customerId, '客戶完成 LIFF 表單填寫，已通知老闆確認訂單');
}

/**
 * 老闆在後台「加碼」：從完整商品目錄勾選額外要送的品項，跟客戶自己選的分開標記，
 * 不會覆蓋客戶原本選的內容。
 */
async function addExtraSamples(customerId, items) {
  for (const s of items || []) {
    await db.query(
      `INSERT INTO customer_samples (customer_id, sample_name, catalog_item_id, added_by)
       VALUES ($1,$2,$3,'owner')`,
      [customerId, s.name, s.catalogItemId || null]
    );
  }
  if (items && items.length) {
    await addTimelineEvent(
      customerId,
      `老闆加碼樣品：${items.map((s) => s.name).join('、')}`
    );
  }
}

/** 移除一筆樣品紀錄（客戶選的或老闆加碼的都可以移除，用於後台調整最終出貨品項） */
async function removeSample(customerId, sampleId) {
  await db.query('DELETE FROM customer_samples WHERE id=$1 AND customer_id=$2', [
    sampleId,
    customerId,
  ]);
}

/** 老闆在後台確認訂單：設定出貨日，建立 D+2 / D+16 追蹤排程 */
async function confirmOrder(customerId, { shippedAt, shippingNote }) {
  await db.query(
    `UPDATE customers SET stage='shipped', shipped_at=$1, shipping_note=$2, updated_at=now() WHERE id=$3`,
    [shippedAt, shippingNote || null, customerId]
  );
  await db.query(
    `INSERT INTO followups (customer_id, followup_type, scheduled_date)
     VALUES ($1, 'd2', ($2::date + interval '2 day')::date),
            ($1, 'd16', ($2::date + interval '16 day')::date)`,
    [customerId, shippedAt]
  );
  await addTimelineEvent(
    customerId,
    `老闆確認訂單，出貨日 ${shippedAt}，已排程 D+2 / D+16 自動追蹤`
  );
}

async function listCustomers() {
  const r = await db.query('SELECT * FROM customers ORDER BY updated_at DESC');
  return r.rows;
}

/** 給看板列表用：每個客戶附上「最近一筆還沒結束的追蹤排程」，方便前端顯示到期日 */
async function listCustomersWithSummary() {
  const customers = await listCustomers();
  const followupsRes = await db.query(`
    SELECT DISTINCT ON (customer_id) customer_id, followup_type, scheduled_date, status
    FROM followups
    WHERE status IN ('pending','sent')
    ORDER BY customer_id, scheduled_date ASC
  `);
  const map = {};
  followupsRes.rows.forEach((r) => {
    map[r.customer_id] = r;
  });
  return customers.map((c) => ({ ...c, nextFollowup: map[c.id] || null }));
}

async function getCustomerDetail(id) {
  const c = await getById(id);
  if (!c) return null;
  const [samples, timeline, followups] = await Promise.all([
    db.query(
      'SELECT id, sample_name, catalog_item_id, added_by FROM customer_samples WHERE customer_id=$1 ORDER BY id',
      [id]
    ),
    db.query('SELECT * FROM timeline_events WHERE customer_id=$1 ORDER BY created_at ASC', [id]),
    db.query('SELECT * FROM followups WHERE customer_id=$1 ORDER BY scheduled_date ASC', [id]),
  ]);
  return {
    ...c,
    samples: samples.rows,
    timeline: timeline.rows,
    followups: followups.rows,
  };
}

async function updateStage(id, stage) {
  if (!STAGES.includes(stage)) throw new Error('invalid stage: ' + stage);
  await db.query('UPDATE customers SET stage=$1, updated_at=now() WHERE id=$2', [stage, id]);
  await addTimelineEvent(id, `老闆手動將階段更新為「${stage}」`);
}

async function updateNote(id, note) {
  await db.query('UPDATE customers SET owner_note=$1, updated_at=now() WHERE id=$2', [note, id]);
}

/** 標記某客戶目前排程中最新一筆未結束的 followup 為已處理(skipped) */
async function markLatestFollowupHandled(customerId) {
  const r = await db.query(
    `SELECT id FROM followups WHERE customer_id=$1 AND status IN ('pending','sent')
     ORDER BY scheduled_date DESC LIMIT 1`,
    [customerId]
  );
  if (!r.rows.length) return null;
  await db.query(`UPDATE followups SET status='skipped' WHERE id=$1`, [r.rows[0].id]);
  return r.rows[0].id;
}

/** 找出這個客戶最近一筆「已送出、還在等客戶回覆」的 followup（用於webhook把客戶回文記錄進對應排程） */
async function findAwaitingReplyFollowup(customerId) {
  const r = await db.query(
    `SELECT * FROM followups WHERE customer_id=$1 AND status='sent'
     ORDER BY sent_at DESC LIMIT 1`,
    [customerId]
  );
  return r.rows[0] || null;
}

async function recordFollowupReply(followupId, replyText) {
  await db.query(
    `UPDATE followups SET status='replied', reply_text=$1, replied_at=now() WHERE id=$2`,
    [replyText, followupId]
  );
}

/** 排程器用：抓出今天(或更早)已到期、還沒送出的追蹤訊息 */
async function getDueFollowups() {
  const r = await db.query(
    `SELECT f.*, c.line_user_id, c.interest_line, c.store_name
     FROM followups f
     JOIN customers c ON c.id = f.customer_id
     WHERE f.status='pending' AND f.scheduled_date <= CURRENT_DATE`
  );
  return r.rows;
}

async function markFollowupSent(followupId) {
  await db.query(`UPDATE followups SET status='sent', sent_at=now() WHERE id=$1`, [followupId]);
}

module.exports = {
  STAGES,
  addTimelineEvent,
  ensureCustomerByLineUserId,
  getByLineUserId,
  getById,
  setInterestLine,
  submitLiffForm,
  addExtraSamples,
  removeSample,
  confirmOrder,
  listCustomers,
  listCustomersWithSummary,
  getCustomerDetail,
  updateStage,
  updateNote,
  markLatestFollowupHandled,
  findAwaitingReplyFollowup,
  recordFollowupReply,
  getDueFollowups,
  markFollowupSent,
};
