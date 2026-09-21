// 資料存取層：後台帳號（admin_users）。取代原本兩組共用密碼，改成每人一組帳號密碼。
const bcrypt = require('bcryptjs');
const db = require('./db');

const ROLES = ['staff', 'admin', 'superadmin'];
const SALT_ROUNDS = 10;

function sanitize(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

async function count() {
  const r = await db.query('SELECT COUNT(*)::int AS n FROM admin_users');
  return r.rows[0].n;
}

async function findByUsername(username) {
  const r = await db.query('SELECT * FROM admin_users WHERE username=$1', [username]);
  return r.rows[0] || null;
}

async function getById(id) {
  const r = await db.query('SELECT * FROM admin_users WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function listAll() {
  const r = await db.query('SELECT * FROM admin_users ORDER BY role DESC, created_at ASC');
  return r.rows.map(sanitize);
}

/** 目前有效（未停用）的 superadmin 數量，用來擋「不能把最後一個超級管理者停用/降級」 */
async function countActiveSuperadmins(excludingId) {
  const r = await db.query(
    "SELECT COUNT(*)::int AS n FROM admin_users WHERE role='superadmin' AND is_active=true AND id != $1",
    [excludingId || 0]
  );
  return r.rows[0].n;
}

async function create({ username, password, displayName, role, createdBy }) {
  if (!ROLES.includes(role)) throw new Error('不合法的角色');
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const r = await db.query(
    `INSERT INTO admin_users (username, password_hash, display_name, role, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [username, hash, displayName, role, createdBy || null]
  );
  return sanitize(r.rows[0]);
}

async function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compare(password, user.password_hash);
}

async function updateProfile(id, { displayName, isActive }) {
  const fields = [];
  const values = [];
  let i = 1;
  if (displayName !== undefined) {
    fields.push(`display_name=$${i++}`);
    values.push(displayName);
  }
  if (isActive !== undefined) {
    fields.push(`is_active=$${i++}`);
    values.push(isActive);
  }
  if (!fields.length) return getById(id).then(sanitize);
  fields.push('updated_at=now()');
  values.push(id);
  const r = await db.query(
    `UPDATE admin_users SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
    values
  );
  return sanitize(r.rows[0]);
}

async function updateRole(id, role) {
  if (!ROLES.includes(role)) throw new Error('不合法的角色');
  const r = await db.query(
    'UPDATE admin_users SET role=$1, updated_at=now() WHERE id=$2 RETURNING *',
    [role, id]
  );
  return sanitize(r.rows[0]);
}

async function resetPassword(id, password) {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const r = await db.query(
    'UPDATE admin_users SET password_hash=$1, updated_at=now() WHERE id=$2 RETURNING *',
    [hash, id]
  );
  return sanitize(r.rows[0]);
}

module.exports = {
  ROLES,
  sanitize,
  count,
  findByUsername,
  getById,
  listAll,
  countActiveSuperadmins,
  create,
  verifyPassword,
  updateProfile,
  updateRole,
  resetPassword,
};
