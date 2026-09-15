// 資料存取層：熟客直接傳文字下單的記錄（order_messages）
const db = require('./db');

/** 機器人偵測到疑似下單文字時，記一筆下來 */
async function createOrderMessage(customerId, messageText) {
  const r = await db.query(
    `INSERT INTO order_messages (customer_id, message_text) VALUES ($1, $2) RETURNING *`,
    [customerId, messageText]
  );
  return r.rows[0];
}

/** 後台列表：帶出客戶店名/聯絡人/電話方便老闆辨認，預設新到舊排序 */
async function listOrderMessages(status) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE om.status = $1';
  }
  const r = await db.query(
    `SELECT om.*, c.store_name, c.display_name, c.contact_name, c.phone, c.line_user_id
     FROM order_messages om
     JOIN customers c ON c.id = om.customer_id
     ${where}
     ORDER BY om.created_at DESC`,
    params
  );
  return r.rows;
}

async function updateOrderMessageStatus(id, status, ownerNote) {
  const allowed = ['pending', 'confirmed', 'ignored'];
  if (!allowed.includes(status)) throw new Error('invalid order status: ' + status);
  const r = await db.query(
    `UPDATE order_messages
     SET status=$1, owner_note=COALESCE($2, owner_note), handled_at=now()
     WHERE id=$3 RETURNING *`,
    [status, ownerNote, id]
  );
  return r.rows[0] || null;
}

module.exports = {
  createOrderMessage,
  listOrderMessages,
  updateOrderMessageStatus,
};
