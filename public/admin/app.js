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
  var ordersListEl = document.getElementById('ordersList');
  var faqListEl = document.getElementById('faqList');
  var historicalListEl = document.getElementById('historicalList');
  var historicalMetaEl = document.getElementById('historicalMeta');
  var historicalPagerEl = document.getElementById('historicalPager');

  var ORDER_STATUS_LABEL = { pending: '待處理', confirmed: '已確認', ignored: '已忽略' };

  var customers = [];
  var orders = [];
  var faqs = [];
  var historicalState = { q: '', page: 1, pageSize: 50, total: 0 };

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

  // ---- 訂單記錄 ----
  function orderDateTime(d) {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
  }

  function renderOrders() {
    if (!orders.length) {
      ordersListEl.innerHTML = '<div class="empty">目前還沒有偵測到熟客文字下單訊息</div>';
      return;
    }
    ordersListEl.innerHTML = orders.map(function (o) {
      var pillClass = o.status === 'confirmed' ? 'ok' : (o.status === 'ignored' ? '' : 'warn');
      var actions = '';
      if (o.status === 'pending') {
        actions =
          '<button class="btn primary small" data-order-action="confirmed" data-order-id="' + o.id + '">標記已確認</button>' +
          '<button class="btn ghost small" data-order-action="ignored" data-order-id="' + o.id + '">忽略</button>';
      } else {
        actions = '<button class="btn ghost small" data-order-action="pending" data-order-id="' + o.id + '">改回待處理</button>';
      }
      return (
        '<div class="list-row">' +
          '<div class="list-row-head">' +
            '<div><div class="list-row-title">' + escapeHtml(o.store_name || o.display_name || '(未填店名)') + '　' +
              '<span class="list-row-meta">' + escapeHtml(o.contact_name || '') + ' ' + escapeHtml(o.phone || '') + '</span></div>' +
              '<div class="list-row-meta">' + orderDateTime(o.created_at) + '</div></div>' +
            '<span class="pill ' + pillClass + '">' + (ORDER_STATUS_LABEL[o.status] || o.status) + '</span>' +
          '</div>' +
          '<div class="list-row-body">' + escapeHtml(o.message_text) + '</div>' +
          '<div class="list-row-actions">' + actions + '</div>' +
        '</div>'
      );
    }).join('');

    Array.prototype.forEach.call(ordersListEl.querySelectorAll('[data-order-action]'), function (btn) {
      btn.addEventListener('click', async function () {
        try {
          await api('/api/admin/orders/' + btn.getAttribute('data-order-id') + '/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: btn.getAttribute('data-order-action') }),
          });
          showToast('已更新');
          await loadOrders();
        } catch (err) {
          showToast('更新失敗：' + err.message);
        }
      });
    });
  }

  async function loadOrders() {
    var data = await api('/api/admin/orders');
    orders = data.orders;
    renderOrders();
  }

  // ---- FAQ 知識庫 ----
  function renderFaqs() {
    if (!faqs.length) {
      faqListEl.innerHTML = '<div class="empty">還沒有任何問答，點右上角「＋ 新增問答」開始建立</div>';
      return;
    }
    faqListEl.innerHTML = faqs.map(function (f) {
      var autoPill = f.auto_reply
        ? '<span class="pill ok">自動回覆中</span>'
        : '<span class="pill">僅內部參考</span>';
      var activePill = f.is_active ? '' : '<span class="pill warn">已停用</span>';
      return (
        '<div class="list-row">' +
          '<div class="list-row-head">' +
            '<div><div class="list-row-title">' + escapeHtml(f.question) + '</div>' +
              '<div class="list-row-meta">' + escapeHtml(f.category || '未分類') + (f.keywords ? '　關鍵字：' + escapeHtml(f.keywords) : '') + '</div></div>' +
            '<div>' + autoPill + ' ' + activePill + '</div>' +
          '</div>' +
          '<div class="list-row-body">' + escapeHtml(f.answer) + '</div>' +
          (f.internal_note ? '<div class="list-row-body" style="color:var(--warning);font-size:12px;">⚠️ 內部備註：' + escapeHtml(f.internal_note) + '</div>' : '') +
          '<div class="list-row-actions">' +
            '<button class="btn ghost small" data-faq-edit="' + f.id + '">編輯</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    Array.prototype.forEach.call(faqListEl.querySelectorAll('[data-faq-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        openFaqDrawer(faqs.filter(function (f) { return String(f.id) === btn.getAttribute('data-faq-edit'); })[0]);
      });
    });
  }

  async function loadFaqs() {
    var data = await api('/api/admin/faqs');
    faqs = data.faqs;
    renderFaqs();
  }

  function openFaqDrawer(faq) {
    var isEdit = !!faq;
    faq = faq || { category: '', question: '', answer: '', keywords: '', is_active: true, auto_reply: false, internal_note: '' };
    drawer.innerHTML =
      '<div class="drawer-head">' +
        '<div><p class="drawer-store">' + (isEdit ? '編輯問答' : '新增問答') + '</p></div>' +
        '<button class="drawer-close" id="drawerClose">✕</button>' +
      '</div>' +
      '<div class="drawer-body faq-form">' +
        '<label>分類（例如：保存方式、代工最低量⋯，可留空）</label>' +
        '<input type="text" id="faqCategory" value="' + escapeHtml(faq.category || '') + '">' +
        '<label>問題</label>' +
        '<input type="text" id="faqQuestion" value="' + escapeHtml(faq.question || '') + '">' +
        '<label>答案（客戶會看到這段內容）</label>' +
        '<textarea id="faqAnswer">' + escapeHtml(faq.answer || '') + '</textarea>' +
        '<label>觸發關鍵字（逗號分隔，例如：保存期限,可以放多久）</label>' +
        '<input type="text" id="faqKeywords" value="' + escapeHtml(faq.keywords || '') + '">' +
        '<label>內部備註（只有老闆自己看得到，不會傳給客戶——例如提醒自己這題答案還沒完全確定）</label>' +
        '<textarea id="faqInternalNote" placeholder="例如：常溫保存期限過往對話有2/3/4個月不同說法，需跟老闆確認最新標準">' + escapeHtml(faq.internal_note || '') + '</textarea>' +
        '<div class="checkbox-row"><input type="checkbox" id="faqIsActive"' + (faq.is_active ? ' checked' : '') + '> <label style="margin:0;font-weight:400;color:var(--text)">啟用（顯示在知識庫列表中）</label></div>' +
        '<div class="checkbox-row"><input type="checkbox" id="faqAutoReply"' + (faq.auto_reply ? ' checked' : '') + '> <label style="margin:0;font-weight:400;color:var(--text)">開啟自動回覆（客戶在 LINE 問到關鍵字時，機器人直接用這則答案回覆——答案不確定時請先不要打開）</label></div>' +
        '<div style="display:flex;gap:8px;margin-top:18px;">' +
          '<button class="btn primary" id="faqSaveBtn">儲存</button>' +
          (isEdit ? '<button class="btn ghost" id="faqDeleteBtn">刪除</button>' : '') +
        '</div>' +
      '</div>';
    scrim.classList.add('open');
    drawer.classList.add('open');
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('faqSaveBtn').addEventListener('click', async function () {
      var payload = {
        category: document.getElementById('faqCategory').value.trim(),
        question: document.getElementById('faqQuestion').value.trim(),
        answer: document.getElementById('faqAnswer').value.trim(),
        keywords: document.getElementById('faqKeywords').value.trim(),
        internalNote: document.getElementById('faqInternalNote').value.trim(),
        isActive: document.getElementById('faqIsActive').checked,
        autoReply: document.getElementById('faqAutoReply').checked,
      };
      if (!payload.question || !payload.answer) {
        showToast('請填寫問題與答案');
        return;
      }
      try {
        if (isEdit) {
          await api('/api/admin/faqs/' + faq.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } else {
          await api('/api/admin/faqs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
        showToast('已儲存');
        closeDrawer();
        await loadFaqs();
      } catch (err) {
        showToast('儲存失敗：' + err.message);
      }
    });
    var deleteBtn = document.getElementById('faqDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        try {
          await api('/api/admin/faqs/' + faq.id, { method: 'DELETE' });
          showToast('已刪除');
          closeDrawer();
          await loadFaqs();
        } catch (err) {
          showToast('刪除失敗：' + err.message);
        }
      });
    }
  }

  // ---- 歷史客戶紀錄 ----
  var TAG_LABEL = { red: '紅標', purple: '紫標' };

  function renderHistorical(data) {
    var rows = data.rows;
    historicalState.total = data.total;
    historicalState.page = data.page;
    historicalState.pageSize = data.pageSize;

    historicalMetaEl.textContent = '共 ' + data.total + ' 筆（有對話內容的歷史聯絡人；純加好友沒有互動的不列入）';

    if (!rows.length) {
      historicalListEl.innerHTML = '<div class="empty">沒有符合的資料</div>';
      historicalPagerEl.innerHTML = '';
      return;
    }

    historicalListEl.innerHTML = rows.map(function (r) {
      var tagHtml = r.tag ? '<span class="tag-dot ' + r.tag + '"></span>' + (TAG_LABEL[r.tag] || '') + '　' : '';
      var orderPill = r.likely_ordered ? '<span class="pill ok">疑似曾下單</span>' : '';
      var title = r.store_name || r.display_name || '(未命名)';
      var metaParts = [];
      if (r.contact_name) metaParts.push(r.contact_name);
      if (r.phone) metaParts.push(r.phone);
      if (r.product_interest) metaParts.push(r.product_interest);
      return (
        '<div class="list-row">' +
          '<div class="list-row-head">' +
            '<div><div class="list-row-title">' + tagHtml + escapeHtml(title) + '</div>' +
              '<div class="list-row-meta">' + escapeHtml(metaParts.join('　')) + '</div>' +
              (r.address ? '<div class="list-row-meta">' + escapeHtml(r.address) + '</div>' : '') +
              '<div class="list-row-meta">最後互動：' + escapeHtml(r.last_contact_at || '未知') + '　共 ' + r.message_count + ' 則訊息　來源檔案：' + escapeHtml(r.source_file || '') + '</div></div>' +
            '<div>' + orderPill + '</div>' +
          '</div>' +
          (r.summary ? '<div class="list-row-body">' + escapeHtml(r.summary) + '</div>' : '') +
        '</div>'
      );
    }).join('');

    var totalPages = Math.max(Math.ceil(data.total / data.pageSize), 1);
    historicalPagerEl.innerHTML =
      '<button class="btn ghost small" id="histPrevBtn"' + (data.page <= 1 ? ' disabled' : '') + '>上一頁</button>' +
      '<span>第 ' + data.page + ' / ' + totalPages + ' 頁</span>' +
      '<button class="btn ghost small" id="histNextBtn"' + (data.page >= totalPages ? ' disabled' : '') + '>下一頁</button>';
    var prevBtn = document.getElementById('histPrevBtn');
    var nextBtn = document.getElementById('histNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () { loadHistorical(historicalState.page - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { loadHistorical(historicalState.page + 1); });
  }

  async function loadHistorical(page) {
    historicalState.page = page || 1;
    var params = new URLSearchParams({
      q: historicalState.q,
      page: String(historicalState.page),
      pageSize: String(historicalState.pageSize),
    });
    var data = await api('/api/admin/historical-customers?' + params.toString());
    renderHistorical(data);
  }

  document.getElementById('historicalSearchBtn').addEventListener('click', function () {
    historicalState.q = document.getElementById('historicalSearch').value.trim();
    loadHistorical(1).catch(function (e) { showToast('搜尋失敗：' + e.message); });
  });
  document.getElementById('historicalSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('historicalSearchBtn').click();
  });

  // ---- 分頁切換 ----
  var loadedViews = { board: true, orders: false, faq: false, historical: false };
  function switchView(view) {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab-btn'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (el) {
      el.classList.remove('active');
    });
    document.getElementById(view + 'View').classList.add('active');
    if (!loadedViews[view]) {
      loadedViews[view] = true;
      if (view === 'orders') loadOrders().catch(function (e) { showToast('讀取訂單記錄失敗：' + e.message); });
      if (view === 'faq') loadFaqs().catch(function (e) { showToast('讀取知識庫失敗：' + e.message); });
      if (view === 'historical') loadHistorical(1).catch(function (e) { showToast('讀取歷史客戶紀錄失敗：' + e.message); });
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab-btn'), function (btn) {
    btn.addEventListener('click', function () { switchView(btn.getAttribute('data-view')); });
  });

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
  document.getElementById('ordersRefreshBtn').addEventListener('click', function () {
    loadOrders().catch(function (e) { showToast('重新整理失敗：' + e.message); });
  });
  document.getElementById('addFaqBtn').addEventListener('click', function () {
    openFaqDrawer(null);
  });

  init();
})();
