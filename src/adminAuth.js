const jwt = require('jsonwebtoken');
const config = require('./config');
const userRepo = require('./adminUserRepo');

const COOKIE_NAME = 'malajiang_admin';
const EXPIRES_IN = '7d';

/** JWT 只放 user id，角色/是否停用每次都即時查資料庫確認，帳號被停用或改權限可以立刻生效，不用等 token 過期 */
function issueToken(userId) {
  return jwt.sign({ sub: userId }, config.admin.jwtSecret, { expiresIn: EXPIRES_IN });
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

function readTokenPayload(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, config.admin.jwtSecret);
  } catch (err) {
    return null;
  }
}

/** Express middleware：保護 /api/admin/* 路由（登入/登出本身除外），任何有效帳號（staff/admin/superadmin）都可通過 */
async function requireAdmin(req, res, next) {
  const payload = readTokenPayload(req);
  if (!payload || !payload.sub) return res.status(401).json({ ok: false, error: '請先登入' });
  try {
    const user = await userRepo.getById(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: '帳號已停用或不存在，請重新登入' });
    }
    req.adminUser = userRepo.sanitize(user);
    req.adminRole = user.role;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: '驗證登入狀態失敗' });
  }
}

/** Express middleware：只有超級管理者能通過，目前僅保護帳號系統的敏感操作（例如首次初始化） */
function requireSuperAdmin(req, res, next) {
  if (req.adminRole !== 'superadmin') {
    return res.status(403).json({ ok: false, error: '這個功能只有超級管理者能操作' });
  }
  next();
}

/** Express middleware：admin（老闆）或 superadmin 才能通過，用來保護商品目錄／樣品模板的新增編輯路由。
 *  原本這兩份資料限「只有超級管理者」，經與 ULY 討論後開放給老闆自己維護，不用每次都找 ULY 改。 */
function requireCatalogManager(req, res, next) {
  if (req.adminRole !== 'admin' && req.adminRole !== 'superadmin') {
    return res.status(403).json({ ok: false, error: '沒有權限管理商品目錄／樣品模板' });
  }
  next();
}

/** Express middleware：admin（老闆）或 superadmin 才能通過，用來保護「帳號管理」路由；
 *  admin 跟 superadmin 各自能管到什麼帳號、能不能改角色，在路由邏輯裡再細分。 */
function requireAccountManager(req, res, next) {
  if (req.adminRole !== 'admin' && req.adminRole !== 'superadmin') {
    return res.status(403).json({ ok: false, error: '沒有權限管理帳號' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  issueToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdmin,
  requireSuperAdmin,
  requireCatalogManager,
  requireAccountManager,
};
