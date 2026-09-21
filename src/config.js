require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    console.warn(`[config] 警告：環境變數 ${name} 尚未設定`);
    return '';
  }
  return v;
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),

  line: {
    channelAccessToken: required('LINE_CHANNEL_ACCESS_TOKEN'),
    channelSecret: required('LINE_CHANNEL_SECRET'),
    channelId: required('LINE_CHANNEL_ID'),
    liffId: required('LIFF_ID'),
    ownerUserId: required('OWNER_LINE_USER_ID'),
  },

  databaseUrl: required('DATABASE_URL'),

  admin: {
    // 後台登入改成每人一組帳號密碼（admin_users 資料表），不再用共用密碼，
    // 只留 JWT_SECRET 用來簽發登入憑證。第一批帳號（超級管理者/老闆）
    // 透過 /api/admin/bootstrap-accounts 一次性建立，詳見 README。
    jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-me'),
  },

  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
};
