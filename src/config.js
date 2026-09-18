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
    // 一般管理者（老闆）登入密碼：日常後台操作（確認訂單、加碼樣品、FAQ...）都可以用這組。
    password: required('ADMIN_PASSWORD', 'change-me'),
    // 超級管理者密碼：多一層權限，只有這組登入才能新增/編輯商品目錄與樣品模板。
    // 沒設定的話超級管理者功能就不會開放（一般管理者密碼仍可正常使用）。
    superadminPassword: required('SUPERADMIN_PASSWORD', ''),
    jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-me'),
  },

  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
};
