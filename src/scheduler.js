const cron = require('node-cron');
const line = require('./lineClient');
const repo = require('./customerRepo');
const { PRODUCT_LINES } = require('./productLines');

function messageForFollowup(followup) {
  const line_ = PRODUCT_LINES[followup.interest_line] || PRODUCT_LINES.malajiang;
  return followup.followup_type === 'd2' ? line_.d2Message : line_.d16Message;
}

async function runDueFollowups() {
  const due = await repo.getDueFollowups();
  if (!due.length) return;
  console.log(`[scheduler] 發現 ${due.length} 筆到期的追蹤訊息，開始發送...`);
  for (const followup of due) {
    try {
      const text = messageForFollowup(followup);
      await line.pushMessage(followup.line_user_id, [line.textMessage(text)]);
      await repo.markFollowupSent(followup.id);
      await repo.addTimelineEvent(
        followup.customer_id,
        `${followup.followup_type === 'd2' ? 'D+2' : 'D+16'} 自動排程觸發，已推播訊息`
      );
      // D+2 送出時，順便把階段推進到「樣品追蹤中」
      if (followup.followup_type === 'd2') {
        await repo.updateStage(followup.customer_id, 'tracking').catch(() => {});
      }
    } catch (err) {
      console.error(`[scheduler] 發送 followup #${followup.id} 失敗`, err);
    }
  }
}

/**
 * 每天早上 9:00（伺服器時區）檢查一次到期的 D+2 / D+16 追蹤訊息。
 * 若要改時間，調整下面的 cron 表達式即可（分 時 日 月 星期）。
 * 注意：Railway 預設容器時區通常是 UTC，如需台灣時間 9:00，
 * 可在 Railway 服務的環境變數設定 TZ=Asia/Taipei。
 */
function startScheduler() {
  cron.schedule('0 9 * * *', () => {
    runDueFollowups().catch((err) => console.error('[scheduler] 執行失敗', err));
  });
  console.log('[scheduler] 已啟動，每日 09:00 檢查 D+2 / D+16 追蹤排程');
}

module.exports = { startScheduler, runDueFollowups };
