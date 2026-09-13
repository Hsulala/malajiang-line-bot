const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  // Railway 的 Postgres 對外連線需要 SSL；本機 docker/localhost 通常不需要，
  // 用 DATABASE_URL 是否包含 localhost 簡單判斷即可。
  ssl: /localhost|127\.0\.0\.1/.test(config.databaseUrl) ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] 未預期的連線池錯誤', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
