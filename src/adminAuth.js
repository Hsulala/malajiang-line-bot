const jwt = require('jsonwebtoken');
const config = require('./config');

const COOKIE_NAME = 'malajiang_admin';
const EXPIRES_IN = '7d';

function issueToken(role) {
  return jwt.sign({ role: role || 'admin' }, config.admin.jwtSecret, { expiresIn: EXPIRES_IN });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function readToken(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, config.admin.jwtSecret);
  } catch (err) {
    return null;
  }
}

/** Express middleware：保護 /api/admin/* 路由（登入/登出本身除外），任何角色（老闆/超級管理者）都可通過 */
function requireAdmin(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ ok: false, error: '請先登入' });
  req.adminRole = payload.role || 'admin';
  next();
}

/** Express middleware：只有超級管理者能通過，用來保護商品目錄／樣品模板的新增編輯路由 */
function requireSuperAdmin(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ ok: false, error: '請先登入' });
  if (payload.role !== 'superadmin') {
    return res.status(403).json({ ok: false, error: '這個功能只有超級管理者能操作' });
  }
  req.adminRole = 'superadmin';
  next();
}

module.exports = {
  COOKIE_NAME,
  issueToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdmin,
  requireSuperAdmin,
};
