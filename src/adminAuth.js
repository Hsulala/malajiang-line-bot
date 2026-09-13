const jwt = require('jsonwebtoken');
const config = require('./config');

const COOKIE_NAME = 'malajiang_admin';
const EXPIRES_IN = '7d';

function issueToken() {
  return jwt.sign({ role: 'admin' }, config.admin.jwtSecret, { expiresIn: EXPIRES_IN });
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

/** Express middleware：保護 /api/admin/* 路由（登入/登出本身除外） */
function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, error: '請先登入' });
  try {
    jwt.verify(token, config.admin.jwtSecret);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: '登入已過期，請重新登入' });
  }
}

module.exports = { COOKIE_NAME, issueToken, setAuthCookie, clearAuthCookie, requireAdmin };
