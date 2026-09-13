(function () {
  var STAGES = [
    { key: 'new', title: '新接觸', color: 'var(--text-faint)' },
    { key: 'confirm', title: '待老闆確認', color: 'var(--warning)' },
    { key: 'shipped', title: '已出貨', color: 'var(--accent)' },
    { key: 'tracking', title: '樣品追蹤中', color: 'var(--accent)' },
    { key: 'won', title: '已成交', color: 'var(--success)' },
    { key: 'closed', title: '結案', color: 'var(--text-faint)' },
  ];
  var STAGE_TITLE = {};
  STAGES.forEach(function (s) { STAGE_TITLE[s.key] = s.title; });

  var INTEREST_LABEL = { malajiang: '麻辣醬', herb: '中藥材', both: '兩者皆有興趣' };

  var boardEl = document.getElementById('board');
  var statsEl = document.getElementById('stats');
  var scrim = document.getElementById('scrim');
  var drawer = document.getElementById('drawer');
  var toastEl = document.getElementById('toast');

  var customers = [];

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  async function api(path, options) {
    var resp = await fetch(path, Object.assign({ credentials: 'include' }, options || {}));
    if (resp.status === 401) {
      window.location.href = '/admin/login.html';
      throw new Error('未登入');
    }
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || data.ok === false) {
      throw new Error(data.error || '發生錯誤');
    }
    return data;
  }

  function formatDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  function dueLabel(c) {
    if (c.stage === 'new') return '等待互動';
    if (c.stage === 'confirm') return '待您確認';
    if (c.stage === 'closed') return '已結案';
    if (c.stage === 'won') return '成交，追蹤中';
    if (c.nextFollowup) {
      var label = c.nextFollowup.followup_type === 'd2' ? '追蹤收件' : '追蹤測試';
      return formatDate(c.nextFollowup.scheduled_date) + ' ' + label;
    }
    return c.stage === 'shipped' ? '已出貨' : '追蹤中';
  }

  function renderStats() {
    var total = customers.length;
    var thisMonth = new Date().getMonth();
    var newThisMonth = customers.filter(function (c) {
      return c.created_at && new Date(c.created_at).getMonth() === thisMonth;
    }).length;
    var pendingConfirm = customers.filter(function (c) { return c.stage === 'confirm'; }).length;
    var tracking = customers.filter(function (c) { return c.stage === 'tracking'; }).length;
    var won = customers.filter(function (c) { return c.stage === 'won'; }).length;
    var conversion = total ? ((won / total) * 100).toFixed(1) : '0.0';

    statsEl.innerHTML =
      tile('客戶總數', total, '本月新增 ' + newThisMonth + ' 位') +
      tile('待老闆確認訂單', pendingConfirm, '需要您處理') +
      tile('樣品追蹤中', tracking, 'D+2 / D+16 排程中') +
      tile('已成交', won, '轉換率 ' + conversion + '%');
  }
  function tile(label, value, delta) {
    return (
      '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value mono">' + value + '</div>' +
      '<div class="stat-delta">' + delta + '</div></div>'
    );
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    STAGES.forEach(function (col) {
      var items = customers.filter(function (c) { return c.stage === col.key; });
      var colEl = document.createElement('div');
      colEl.className = 'col';
      colEl.style.setProperty('--col-color', col.color);
      colEl.innerHTML =
        '<div class="col-head"><span class="col-head-title">' + col.title + '</span>' +
        '<span class="col-count mono">' + items.length + '</span></div>' +
        '<div class="col-cards"></div>';
      var cardsWrap = colEl.querySelector('.col-cards');
      items.forEach(function (c) {
        var btn = document.createElement('button');
        btn.className = 'card';
        var pillClass = c.stage === 'won' ? 'ok' : (c.stage === 'confirm' ? 'warn' : 'accent');
        var interest = INTEREST_LABEL[c.interest_line] || '尚未選擇';
        btn.innerHTML =
          '<div class="card-store">' + escapeHtml(c.store_name || c.display_name || '(未填店名)') + '</div>' +
          '<div class="card-contact">' + escapeHtml(c.contact_name || '') + '　<span class="mono">' + escapeHtml(c.phone || '') + '</span></div>' +
          '<div class="card-row"><span class="pill ' + pillClass + '">' + interest + '</span><span class="card-due">' + dueLabel(c) + '</span></div>';
        btn.addEventListener('click', function () { openDrawer(c.id); });
        cardsWrap.appendChild(btn);
      });
      boardEl.appendChild(colEl);
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function toneClass(status) {
    if (status === 'replied') return 'ok';
    if (status === 'sent' || status === 'pending') return 'warn';
    return '';
  }
  function followupStatusText(f) {
    var typeLabel = f.followup_type === 'd2' ? 'D+2 確認收件' : 'D+16 追蹤測試';
    var statusText = {
      pending: '已排程 ' + formatDate(f.scheduled_date),
      sent: '已送出，等待回覆',
      replied: '已回覆：' + (f.reply_text || ''),
      skipped: '已標記處理',
    }[f.status] || f.status;
    return { label: typeLabel, status: statusText };
  }

  async function openDrawer(id) {
    drawer.innerHTML = '<div class="loading">載入中...</div>';
    scrim.classList.add('open');
    drawer.classList.add('open');
    try {
      var data = await api('/api/admin/customers/' + id);
      renderDrawer(data.customer);
    } catch (e) {
      drawer.innerHTML = '<div class="empty">載入失敗：' + escapeHtml(e.message) + '</div>';
    }
  }

  function renderDrawer(c) {
    var samplesHtml = c.samples.length
      ? c.samples.map(function (s) { return '<span class="sample-chip">' + escapeHtml(s) + '</span>'; }).join('')
      : '<span class="sample-chip">尚未選擇</span>';

    var followHtml = c.followups.length
      ? c.followups.map(function (f) {
          var t = followupStatusText(f);
          return '<div class="followup-row"><span>' + t.label + '</span><span class="pill ' + toneClass(f.status) + '">' + escapeHtml(t.status) + '</span></div>';
        }).join('')
      : '<div class="followup-row"><span>尚未進入排程</span><span class="pill">—</span></div>';

    var timelineHtml = c.timeline.length
      ? c.timeline.map(function (t) {
          var dt = new Date(t.created_at);
          var dstr = (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
          return '<div class="t-item"><div class="t-dot"></div><div class="t-content"><div class="t-date mono">' + dstr + '</div>' + escapeHtml(t.event_text) + '</div></div>';
        }).join('')
      : '<div class="t-content" style="color:var(--text-faint)">尚無紀錄</div>';

    var stageOptions = STAGES.map(function (s) {
      return '<option value="' + s.key + '"' + (s.key === c.stage ? ' selected' : '') + '>' + s.title + '</option>';
    }).join('');

    var shipSection = '';
    if (c.stage === 'confirm') {
      var todayStr = new Date().toISOString().slice(0, 10);
      shipSection =
        '<div><p class="section-title">確認訂單並安排出貨</p>' +
        '<div class="ship-form">' +
        '<label style="font-size:11px;color:var(--text-faint)">出貨日期</label>' +
        '<input type="date" id="shipDate" value="' + todayStr + '">' +
        '<label style="font-size:11px;color:var(--text-faint)">出貨備註（會顯示在給客戶的通知訊息中）</label>' +
        '<textarea id="shipNote" placeholder="例如：麻辣醬系列（新竹貨運）、濃縮高湯系列（便利袋）"></textarea>' +
        '<button class="btn primary" id="confirmOrderBtn">確認訂單並通知客戶出貨</button>' +
        '</div></div>';
    } else if (c.shipped_at) {
      shipSection =
        '<div><p class="section-title">出貨資訊</p>' +
        '<div class="field-value">出貨日：' + formatDate(c.shipped_at) + '</div>' +
        (c.shipping_note ? '<div class="field-value" style="margin-top:4px;color:var(--text-muted)">' + escapeHtml(c.shipping_note) + '</div>' : '') +
        '</div>';
    }

    drawer.innerHTML =
      '<div class="drawer-head">' +
        '<div><p class="drawer-store">' + escapeHtml(c.store_name || c.display_name || '(未填店名)') + '</p>' +
        '<p class="drawer-contact">' + escapeHtml(c.contact_name || '') + '　' + escapeHtml(c.phone || '') + '</p></div>' +
        '<button class="drawer-close" id="drawerClose">✕</button>' +
      '</div>' +
      '<div class="drawer-body">' +
        '<div class="field-grid">' +
          '<div><div class="field-label">興趣類別</div><div class="field-value">' + (INTEREST_LABEL[c.interest_line] || '尚未選擇') + '</div></div>' +
          '<div><div class="field-label">目前階段</div><select class="stage-select" id="stageSelect">' + stageOptions + '</select></div>' +
          '<div style="grid-column:1/-1"><div class="field-label">地址</div><div class="field-value">' + escapeHtml(c.address || '尚未填寫') + '</div></div>' +
        '</div>' +
        shipSection +
        '<div><p class="section-title">樣品申請項目</p><div class="sample-list">' + samplesHtml + '</div></div>' +
        '<div><p class="section-title">追蹤排程</p>' + followHtml + '</div>' +
        '<div><p class="section-title">互動歷程</p><div class="timeline">' + timelineHtml + '</div></div>' +
        '<div><p class="section-title">老闆備註</p>' +
        '<textarea class="note-box" id="noteBox" placeholder="輸入備註，例如：客戶偏好清湯類、可優先追蹤⋯">' + escapeHtml(c.owner_note || '') + '</textarea>' +
        '<div style="display:flex;gap:8px;margin-top:8px;">' +
          '<button class="btn primary" id="saveNoteBtn">儲存備註</button>' +
          '<button class="btn ghost" id="markProcessedBtn">標記為已處理</button>' +
        '</div></div>' +
      '</div>';

    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('stageSelect').addEventListener('change', async function (e) {
      try {
        await api('/api/admin/customers/' + c.id + '/stage', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: e.target.value }),
        });
        showToast('階段已更新');
        await loadCustomers();
        openDrawer(c.id);
      } catch (err) {
        showToast('更新失敗：' + err.message);
      }
    });
    document.getElementById('saveNoteBtn').addEventListener('click', async function () {
      try {
        await api('/api/admin/customers/' + c.id + '/note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: document.getElementById('noteBox').value }),
        });
        showToast('備註已儲存');
      } catch (err) {
        showToast('儲存失敗：' + err.message);
      }
    });
    document.getElementById('markProcessedBtn').addEventListener('click', async function () {
      try {
        await api('/api/admin/customers/' + c.id + '/mark-processed', { method: 'POST' });
        showToast('已標記為處理');
        await loadCustomers();
        openDrawer(c.id);
      } catch (err) {
        showToast('操作失敗：' + err.message);
      }
    });
    var confirmBtn = document.getElementById('confirmOrderBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function () {
        try {
          await api('/api/admin/customers/' + c.id + '/confirm-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shippedAt: document.getElementById('shipDate').value,
              shippingNote: document.getElementById('shipNote').value,
            }),
          });
          showToast('已確認訂單並通知客戶');
          await loadCustomers();
          openDrawer(c.id);
        } catch (err) {
          showToast('操作失敗：' + err.message);
        }
      });
    }
  }

  function closeDrawer() {
    scrim.classList.remove('open');
    drawer.classList.remove('open');
  }
  scrim.addEventListener('click', closeDrawer);

  async function loadCustomers() {
    var data = await api('/api/admin/customers');
    customers = data.customers;
    renderStats();
    renderBoard();
  }

  async function init() {
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('zh-TW');
    try {
      await api('/api/admin/me');
    } catch (e) {
      return; // api() already redirected to login
    }
    try {
      await loadCustomers();
    } catch (e) {
      boardEl.innerHTML = '<div class="empty">載入失敗：' + escapeHtml(e.message) + '</div>';
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await api('/api/admin/logout', { method: 'POST' }).catch(function () {});
    window.location.href = '/admin/login.html';
  });
  document.getElementById('refreshBtn').addEventListener('click', function () {
    loadCustomers().catch(function (e) { showToast('重新整理失敗：' + e.message); });
  });

  init();
})();
