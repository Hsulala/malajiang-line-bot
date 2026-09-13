// 建立資料表：node src/migrate.js
// 部署到 Railway 後，可在 Railway 專案的 Shell 或本機（指向同一個 DATABASE_URL）執行一次即可。
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  console.log('[migrate] 開始建立資料表...');
  await db.query(sql);
  console.log('[migrate] 完成，資料表已就緒。');
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate] 失敗：', err);
  process.exit(1);
});
