const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const config = require('./config');
const webhookRouter = require('./webhook');
const liffRouter = require('./liffRoutes');
const adminRouter = require('./adminRoutes');
const { startScheduler } = require('./scheduler');

const app = express();

app.use(cookieParser());

// 全域 JSON 解析，並保留原始 body（req.rawBody）供 /webhook 驗證簽章使用
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get('/health', (req, res) => res.json({ ok: true, service: 'malajiang-line-bot' }));

// LINE Messaging API webhook
app.use('/', webhookRouter);

// LIFF 表單相關 API
app.use('/', liffRouter);

// 後台管理 API
app.use('/', adminRouter);

// 靜態頁面：LIFF 表單、後台前端
app.use('/liff', express.static(path.join(__dirname, '..', 'public', 'liff')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

app.get('/', (req, res) => res.redirect('/admin'));

app.listen(config.port, () => {
  console.log(`[server] 麻辣工坊 LINE 機器人服務已啟動，port=${config.port}`);
  startScheduler();
});
