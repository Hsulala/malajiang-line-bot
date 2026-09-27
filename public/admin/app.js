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

  // interest_line 現在存的是樣品模板的 key，顯示名稱從 /api/admin/sample-templates 動態帶入
  var TEMPLATE_LABEL = {};

  var boardEl = document.getElementById('board');
  var statsEl = document.getElementById('stats');
  var scrim = document.getElementById('scrim');
  var drawer = document.getElementById('drawer');
  var navPanel = document.getElementById('tabs');
  var navScrim = document.getElementById('navScrim');
  var navToggleBtn = document.getElementById('navToggleBtn');
  var navCloseBtn = document.getElementById('navCloseBtn');
  var toastEl = document.getElementById('toast');
  var ordersListEl = document.getElementById('ordersList');
  var faqListEl = document.getElementById('faqList');
  var historicalListEl = document.getElementById('historicalList');
  var historicalMetaEl = document.getElementById('historicalMeta');
  var historicalPagerEl = document.getElementById('historicalPager');
  var catalogListEl = document.getElementById('catalogList');
  var templatesListEl = document.getElementById('templatesList');
  var accountsListEl = document.getElementById('accountsList');

  var ORDER_STATUS_LABEL = { pending: '待處理', confirmed: '已確認', ignored: '已忽略' };
  var ROLE_LABEL = { staff: '員工', admin: '老闆', superadmin: '超級管理者' };

  var customers = [];
  var orders = [];
  var faqs = [];
  var catalogItems = [];
  var sampleTemplates = [];
  var accounts = [];
  var currentRole = 'admin';
  var currentUsername = '';
  var historicalState = { q: '', page: 1, pageSize: 50, total: 0 };
  var catalogSearchState = { q: '' };

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
        var interest = TEMPLATE_LABEL[c.interest_line] || (c.interest_line === 'multiple' ? '多種類型' : '尚未選擇');
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
      ? c.samples.map(function (s) {
          var ownerTag = s.added_by === 'owner' ? '　<span style="color:var(--accent-strong)">(老闆加碼)</span>' : '';
          return (
            '<span class="sample-chip">' + escapeHtml(s.sample_name) + ownerTag +
            ' <a href="#" data-remove-sample="' + s.id + '" style="color:var(--text-faint);text-decoration:none;margin-left:4px;">✕</a></span>'
          );
        }).join('')
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
          '<div><div class="field-label">店家類型</div><div class="field-value">' + (TEMPLATE_LABEL[c.interest_line] || (c.interest_line === 'multiple' ? '多種類型' : '尚未選擇')) + '</div></div>' +
          '<div><div class="field-label">目前階段</div><select class="stage-select" id="stageSelect">' + stageOptions + '</select></div>' +
          '<div style="grid-column:1/-1"><div class="field-label">地址</div><div class="field-value">' + escapeHtml(c.address || '尚未填寫') + '</div></div>' +
        '</div>' +
        shipSection +
        '<div><p class="section-title">樣品申請項目</p><div class="sample-list">' + samplesHtml + '</div>' +
          '<button class="btn ghost small" id="addExtraSampleBtn" style="margin-top:8px;">＋ 加碼樣品</button>' +
          '<div id="extraSamplePicker" style="display:none;margin-top:10px;"></div>' +
        '</div>' +
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
    Array.prototype.forEach.call(drawer.querySelectorAll('[data-remove-sample]'), function (a) {
      a.addEventListener('click', async function (e) {
        e.preventDefault();
        try {
          await api('/api/admin/customers/' + c.id + '/samples/' + a.getAttribute('data-remove-sample'), {
            method: 'DELETE',
          });
          showToast('已移除');
          openDrawer(c.id);
        } catch (err) {
          showToast('移除失敗：' + err.message);
        }
      });
    });
    var addExtraBtn = document.getElementById('addExtraSampleBtn');
    if (addExtraBtn) {
      addExtraBtn.addEventListener('click', async function () {
        var picker = document.getElementById('extraSamplePicker');
        if (picker.style.display !== 'none') {
          picker.style.display = 'none';
          return;
        }
        picker.style.display = 'block';
        picker.innerHTML = '<div class="loading">載入商品目錄中...</div>';
        try {
          if (!catalogItems.length) await loadCatalogItems();
          renderExtraSamplePicker(c.id);
        } catch (err) {
          picker.innerHTML = '<div class="empty">載入失敗：' + escapeHtml(err.message) + '</div>';
        }
      });
    }
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
          (f.internal_note ? '<div class="list-row-body" style="color:var(--warning);font-size:12px;">【內部備註】' + escapeHtml(f.internal_note) + '</div>' : '') +
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

  // ---- 商品目錄 / 樣品模板 共用資料載入 ----
  async function loadCatalogItems() {
    var data = await api('/api/admin/catalog-items');
    catalogItems = data.items;
  }

  async function loadSampleTemplates() {
    var data = await api('/api/admin/sample-templates');
    sampleTemplates = data.templates;
    TEMPLATE_LABEL = {};
    sampleTemplates.forEach(function (t) { TEMPLATE_LABEL[t.key] = t.label; });
  }

  function groupByCategory(items) {
    var groups = {};
    var order = [];
    items.forEach(function (it) {
      if (!groups[it.category]) { groups[it.category] = []; order.push(it.category); }
      groups[it.category].push(it);
    });
    return { groups: groups, order: order };
  }

  // 客戶詳細頁：老闆「加碼」商品挑選器，從完整商品目錄勾選要額外送給這位客戶的品項
  function renderExtraSamplePicker(customerId) {
    var picker = document.getElementById('extraSamplePicker');
    var g = groupByCategory(catalogItems.filter(function (it) { return it.is_active; }));
    var html = '<input type="text" id="extraSampleSearch" placeholder="搜尋品名..." style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;margin-bottom:8px;">';
    html += '<div id="extraSampleOptions" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;">';
    g.order.forEach(function (cat) {
      html += '<div style="font-size:11px;color:var(--text-faint);font-weight:700;margin:8px 0 4px;">' + escapeHtml(cat) + '</div>';
      g.groups[cat].forEach(function (it) {
        var priceText = it.unit_price != null ? ('　$' + it.unit_price + (it.price_unit || '')) : '';
        html +=
          '<label class="extra-sample-option" data-name="' + escapeHtml((it.name + ' ' + (it.spec || '')).toLowerCase()) + '" style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:13px;">' +
          '<input type="checkbox" value="' + it.id + '"> ' + escapeHtml(it.name) + (it.spec ? '（' + escapeHtml(it.spec) + '）' : '') + priceText +
          '</label>';
      });
    });
    html += '</div><button class="btn primary small" id="extraSampleSubmit" style="margin-top:8px;">加入所選品項</button>';
    picker.innerHTML = html;

    document.getElementById('extraSampleSearch').addEventListener('input', function (e) {
      var q = e.target.value.trim().toLowerCase();
      Array.prototype.forEach.call(picker.querySelectorAll('.extra-sample-option'), function (row) {
        row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
      });
    });
    document.getElementById('extraSampleSubmit').addEventListener('click', async function () {
      var ids = Array.prototype.map.call(
        picker.querySelectorAll('input[type=checkbox]:checked'),
        function (cb) { return Number(cb.value); }
      );
      if (!ids.length) { showToast('請至少選一項'); return; }
      try {
        await api('/api/admin/customers/' + customerId + '/extra-samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ catalogItemIds: ids }),
        });
        showToast('已加碼');
        openDrawer(customerId);
      } catch (err) {
        showToast('加碼失敗：' + err.message);
      }
    });
  }

  // ---- 商品目錄管理（老闆/超級管理者限定）----
  function renderCatalogList() {
    var q = catalogSearchState.q.toLowerCase();
    var filtered = catalogItems.filter(function (it) {
      return !q || (it.category + it.name).toLowerCase().indexOf(q) >= 0;
    });
    if (!filtered.length) {
      catalogListEl.innerHTML = '<div class="empty">沒有符合的品項</div>';
      return;
    }
    var g = groupByCategory(filtered);
    var html = '';
    g.order.forEach(function (cat) {
      html += '<p class="section-title" style="margin-top:18px;">' + escapeHtml(cat) + '</p>';
      g.groups[cat].forEach(function (it) {
        var statusPill = it.is_active ? '' : '<span class="pill warn">已下架</span>';
        var priceText = it.unit_price != null ? ('$' + it.unit_price + (it.price_unit || '')) : '未設價';
        html +=
          '<div class="list-row">' +
            '<div class="list-row-head">' +
              '<div><div class="list-row-title">' + escapeHtml(it.name) + '</div>' +
                '<div class="list-row-meta">' + escapeHtml(it.spec || '') + '　' + escapeHtml(priceText) + '</div></div>' +
              '<div>' + statusPill + '</div>' +
            '</div>' +
            '<div class="list-row-actions">' +
              '<button class="btn ghost small" data-catalog-edit="' + it.id + '">編輯</button>' +
            '</div>' +
          '</div>';
      });
    });
    catalogListEl.innerHTML = html;
    Array.prototype.forEach.call(catalogListEl.querySelectorAll('[data-catalog-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        openCatalogItemDrawer(catalogItems.filter(function (it) { return String(it.id) === btn.getAttribute('data-catalog-edit'); })[0]);
      });
    });
  }

  function openCatalogItemDrawer(item) {
    var isEdit = !!item;
    item = item || { category: '', name: '', spec: '', unit_price: '', price_unit: '', is_active: true };
    drawer.innerHTML =
      '<div class="drawer-head">' +
        '<div><p class="drawer-store">' + (isEdit ? '編輯品項' : '新增品項') + '</p></div>' +
        '<button class="drawer-close" id="drawerClose">✕</button>' +
      '</div>' +
      '<div class="drawer-body faq-form">' +
        '<label>分類</label><input type="text" id="ciCategory" value="' + escapeHtml(item.category) + '" placeholder="例如：麻辣醬系列">' +
        '<label>品名</label><input type="text" id="ciName" value="' + escapeHtml(item.name) + '">' +
        '<label>規格</label><input type="text" id="ciSpec" value="' + escapeHtml(item.spec || '') + '" placeholder="例如：1斤、3kg裝">' +
        '<label>單價</label><input type="text" id="ciPrice" value="' + (item.unit_price != null ? item.unit_price : '') + '">' +
        '<label>單位（例如 /kg、/斤，整包/整份計價可留空）</label><input type="text" id="ciPriceUnit" value="' + escapeHtml(item.price_unit || '') + '">' +
        (isEdit ? '<div class="checkbox-row"><input type="checkbox" id="ciActive"' + (item.is_active ? ' checked' : '') + '> <label style="margin:0;font-weight:400;color:var(--text)">上架中</label></div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:18px;"><button class="btn primary" id="ciSaveBtn">儲存</button></div>' +
      '</div>';
    scrim.classList.add('open');
    drawer.classList.add('open');
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('ciSaveBtn').addEventListener('click', async function () {
      var payload = {
        category: document.getElementById('ciCategory').value.trim(),
        name: document.getElementById('ciName').value.trim(),
        spec: document.getElementById('ciSpec').value.trim(),
        unitPrice: document.getElementById('ciPrice').value.trim() ? Number(document.getElementById('ciPrice').value.trim()) : null,
        priceUnit: document.getElementById('ciPriceUnit').value.trim(),
      };
      if (!payload.category || !payload.name) { showToast('請填寫分類與品名'); return; }
      try {
        if (isEdit) {
          payload.isActive = document.getElementById('ciActive').checked;
          await api('/api/admin/catalog-items/' + item.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        } else {
          await api('/api/admin/catalog-items', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        }
        showToast('已儲存');
        closeDrawer();
        await loadCatalogItems();
        renderCatalogList();
      } catch (err) {
        showToast('儲存失敗：' + err.message);
      }
    });
  }

  // ---- 樣品模板管理（老闆/超級管理者限定）----
  function renderTemplatesList() {
    if (!sampleTemplates.length) {
      templatesListEl.innerHTML = '<div class="empty">還沒有任何樣品模板</div>';
      return;
    }
    templatesListEl.innerHTML = sampleTemplates.map(function (t) {
      var statusPill = t.is_active ? '' : '<span class="pill warn">已下架</span>';
      var itemNames = (t.items || []).map(function (it) { return it.name; }).join('、') || '(尚未設定品項)';
      return (
        '<div class="list-row">' +
          '<div class="list-row-head">' +
            '<div><div class="list-row-title">' + escapeHtml(t.label) + '</div>' +
              '<div class="list-row-meta">代碼：' + escapeHtml(t.key) + '</div></div>' +
            '<div>' + statusPill + '</div>' +
          '</div>' +
          '<div class="list-row-body">候選品項：' + escapeHtml(itemNames) + '</div>' +
          '<div class="list-row-actions"><button class="btn ghost small" data-template-edit="' + t.id + '">編輯</button></div>' +
        '</div>'
      );
    }).join('');
    Array.prototype.forEach.call(templatesListEl.querySelectorAll('[data-template-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        openTemplateDrawer(sampleTemplates.filter(function (t) { return String(t.id) === btn.getAttribute('data-template-edit'); })[0]);
      });
    });
  }

  async function openTemplateDrawer(tpl) {
    var isEdit = !!tpl;
    tpl = tpl || { key: '', label: '', trigger_keywords: '', intro_message: '', d2_message: '', d16_message: '', is_active: true, items: [] };
    if (!catalogItems.length) await loadCatalogItems();
    var selectedIds = (tpl.items || []).map(function (it) { return it.id; });
    var g = groupByCategory(catalogItems.filter(function (it) { return it.is_active; }));
    var itemsHtml = '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;">';
    g.order.forEach(function (cat) {
      itemsHtml += '<div style="font-size:11px;color:var(--text-faint);font-weight:700;margin:8px 0 4px;">' + escapeHtml(cat) + '</div>';
      g.groups[cat].forEach(function (it) {
        var checked = selectedIds.indexOf(it.id) >= 0 ? ' checked' : '';
        itemsHtml +=
          '<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:13px;">' +
          '<input type="checkbox" class="tpl-item-cb" value="' + it.id + '"' + checked + '> ' + escapeHtml(it.name) + (it.spec ? '（' + escapeHtml(it.spec) + '）' : '') +
          '</label>';
      });
    });
    itemsHtml += '</div>';

    drawer.innerHTML =
      '<div class="drawer-head">' +
        '<div><p class="drawer-store">' + (isEdit ? '編輯樣品模板' : '新增樣品模板') + '</p></div>' +
        '<button class="drawer-close" id="drawerClose">✕</button>' +
      '</div>' +
      '<div class="drawer-body faq-form">' +
        (isEdit ? '' : '<label>代碼（英數，之後不能改，例如 hotpot）</label><input type="text" id="tplKey" value="">') +
        '<label>顯示名稱（例如：火鍋店）</label><input type="text" id="tplLabel" value="' + escapeHtml(tpl.label) + '">' +
        '<label>額外觸發關鍵字（逗號分隔，顯示名稱本身不用重複填）</label><input type="text" id="tplKeywords" value="' + escapeHtml(tpl.trigger_keywords || '') + '">' +
        '<label>開場話術（客戶選了這個類型之後收到的訊息）</label><textarea id="tplIntro">' + escapeHtml(tpl.intro_message || '') + '</textarea>' +
        '<label>D+2 追蹤訊息</label><textarea id="tplD2">' + escapeHtml(tpl.d2_message || '') + '</textarea>' +
        '<label>D+16 追蹤訊息</label><textarea id="tplD16">' + escapeHtml(tpl.d16_message || '') + '</textarea>' +
        '<label>候選樣品品項（客戶在表單最多可勾 7 樣）</label>' + itemsHtml +
        (isEdit ? '<div class="checkbox-row"><input type="checkbox" id="tplActive"' + (tpl.is_active ? ' checked' : '') + '> <label style="margin:0;font-weight:400;color:var(--text)">上架中</label></div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:18px;"><button class="btn primary" id="tplSaveBtn">儲存</button></div>' +
      '</div>';
    scrim.classList.add('open');
    drawer.classList.add('open');
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('tplSaveBtn').addEventListener('click', async function () {
      var catalogItemIds = Array.prototype.map.call(
        drawer.querySelectorAll('.tpl-item-cb:checked'),
        function (cb) { return Number(cb.value); }
      );
      var payload = {
        label: document.getElementById('tplLabel').value.trim(),
        triggerKeywords: document.getElementById('tplKeywords').value.trim(),
        introMessage: document.getElementById('tplIntro').value.trim(),
        d2Message: document.getElementById('tplD2').value.trim(),
        d16Message: document.getElementById('tplD16').value.trim(),
        catalogItemIds: catalogItemIds,
      };
      if (!payload.label) { showToast('請填寫顯示名稱'); return; }
      try {
        if (isEdit) {
          payload.isActive = document.getElementById('tplActive').checked;
          await api('/api/admin/sample-templates/' + tpl.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        } else {
          var key = document.getElementById('tplKey').value.trim();
          if (!key) { showToast('請填寫代碼'); return; }
          payload.key = key;
          await api('/api/admin/sample-templates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        }
        showToast('已儲存');
        closeDrawer();
        await loadSampleTemplates();
        renderTemplatesList();
      } catch (err) {
        showToast('儲存失敗：' + err.message);
      }
    });
  }

  // ---- 帳號管理（老闆/超級管理者限定）----
  async function loadAccounts() {
    var data = await api('/api/admin/accounts');
    accounts = data.accounts;
  }

  function renderAccountsList() {
    if (!accounts.length) {
      accountsListEl.innerHTML = '<div class="empty">還沒有其他帳號</div>';
      return;
    }
    accountsListEl.innerHTML = accounts.map(function (a) {
      var statusPill = a.is_active ? '' : '<span class="pill warn">已停用</span>';
      var canEdit = currentRole === 'superadmin' || a.role === 'staff';
      var actions = canEdit
        ? '<div class="list-row-actions"><button class="btn ghost small" data-account-edit="' + a.id + '">管理</button></div>'
        : '';
      return (
        '<div class="list-row">' +
          '<div class="list-row-head">' +
            '<div><div class="list-row-title">' + escapeHtml(a.display_name) + '　<span style="color:var(--text-faint);font-weight:400;">@' + escapeHtml(a.username) + '</span></div>' +
              '<div class="list-row-meta">' + escapeHtml(ROLE_LABEL[a.role] || a.role) + '</div></div>' +
            '<div>' + statusPill + '</div>' +
          '</div>' +
          actions +
        '</div>'
      );
    }).join('');
    Array.prototype.forEach.call(accountsListEl.querySelectorAll('[data-account-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        openAccountDrawer(accounts.filter(function (a) { return String(a.id) === btn.getAttribute('data-account-edit'); })[0]);
      });
    });
  }

  function openAccountDrawer(account) {
    var isEdit = !!account;
    // 老闆（admin）只能新增/管理員工帳號，角色欄位直接鎖死不給選；超級管理者可以自由指定角色
    var roleFieldHtml;
    if (currentRole !== 'superadmin') {
      roleFieldHtml = '';
    } else if (isEdit) {
      roleFieldHtml =
        '<label>角色</label><select id="acRole">' +
        userRepoRoleOptions(account.role) +
        '</select>';
    } else {
      roleFieldHtml = '<label>角色</label><select id="acRole">' + userRepoRoleOptions('staff') + '</select>';
    }
    drawer.innerHTML =
      '<div class="drawer-head">' +
        '<div><p class="drawer-store">' + (isEdit ? '管理帳號' : '新增帳號') + '</p></div>' +
        '<button class="drawer-close" id="drawerClose">✕</button>' +
      '</div>' +
      '<div class="drawer-body faq-form">' +
        (isEdit ? '' : '<label>帳號（英數，登入用，之後不能改）</label><input type="text" id="acUsername" value="" autocomplete="off">') +
        '<label>顯示名稱</label><input type="text" id="acDisplayName" value="' + (isEdit ? escapeHtml(account.display_name) : '') + '">' +
        roleFieldHtml +
        (isEdit
          ? '<label>重設密碼（留空代表不修改，要改至少 6 碼）</label><input type="password" id="acNewPassword" autocomplete="new-password">'
          : '<label>密碼（至少 6 碼）</label><input type="password" id="acPassword" autocomplete="new-password">') +
        (isEdit ? '<div class="checkbox-row"><input type="checkbox" id="acActive"' + (account.is_active ? ' checked' : '') + '> <label style="margin:0;font-weight:400;color:var(--text)">啟用中</label></div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:18px;"><button class="btn primary" id="acSaveBtn">儲存</button></div>' +
      '</div>';
    scrim.classList.add('open');
    drawer.classList.add('open');
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('acSaveBtn').addEventListener('click', async function () {
      try {
        if (isEdit) {
          var payload = { displayName: document.getElementById('acDisplayName').value.trim() };
          if (!payload.displayName) { showToast('請填寫顯示名稱'); return; }
          payload.isActive = document.getElementById('acActive').checked;
          var roleSel = document.getElementById('acRole');
          if (roleSel) payload.role = roleSel.value;
          var newPw = document.getElementById('acNewPassword').value;
          if (newPw) {
            if (newPw.length < 6) { showToast('密碼至少要 6 碼'); return; }
            payload.newPassword = newPw;
          }
          await api('/api/admin/accounts/' + account.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        } else {
          var username = document.getElementById('acUsername').value.trim();
          var displayName = document.getElementById('acDisplayName').value.trim();
          var password = document.getElementById('acPassword').value;
          if (!username || !displayName) { showToast('請填寫帳號與顯示名稱'); return; }
          if (!password || password.length < 6) { showToast('密碼至少要 6 碼'); return; }
          var body = { username: username, displayName: displayName, password: password };
          var roleSel2 = document.getElementById('acRole');
          if (roleSel2) body.role = roleSel2.value;
          await api('/api/admin/accounts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
        }
        showToast('已儲存');
        closeDrawer();
        await loadAccounts();
        renderAccountsList();
      } catch (err) {
        showToast('儲存失敗：' + err.message);
      }
    });
  }

  function userRepoRoleOptions(selected) {
    return ['staff', 'admin', 'superadmin'].map(function (r) {
      return '<option value="' + r + '"' + (r === selected ? ' selected' : '') + '>' + (ROLE_LABEL[r] || r) + '</option>';
    }).join('');
  }

  // ---- 分頁切換 ----
  var loadedViews = { board: true, orders: false, faq: false, historical: false, catalog: false, templates: false, accounts: false };
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
      if (view === 'catalog') loadCatalogItems().then(renderCatalogList).catch(function (e) { showToast('讀取商品目錄失敗：' + e.message); });
      if (view === 'templates') loadSampleTemplates().then(renderTemplatesList).catch(function (e) { showToast('讀取樣品模板失敗：' + e.message); });
      if (view === 'accounts') loadAccounts().then(renderAccountsList).catch(function (e) { showToast('讀取帳號列表失敗：' + e.message); });
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab-btn'), function (btn) {
    btn.addEventListener('click', function () { switchView(btn.getAttribute('data-view')); closeNav(); });
  });

  // ---- 手機版側邊選單（漢堡選單）----
  function openNav() {
    navPanel.classList.add('open');
    navScrim.classList.add('open');
  }
  function closeNav() {
    navPanel.classList.remove('open');
    navScrim.classList.remove('open');
  }
  navToggleBtn.addEventListener('click', openNav);
  navScrim.addEventListener('click', closeNav);
  navCloseBtn.addEventListener('click', closeNav);

  async function init() {
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('zh-TW');
    try {
      var me = await api('/api/admin/me');
      currentRole = me.role || 'staff';
      currentUsername = me.username || '';
    } catch (e) {
      return; // api() already redirected to login
    }
    if (currentRole === 'superadmin') {
      Array.prototype.forEach.call(document.querySelectorAll('.superadmin-only'), function (el) {
        el.style.display = '';
      });
    }
    if (currentRole === 'admin' || currentRole === 'superadmin') {
      Array.prototype.forEach.call(document.querySelectorAll('.account-manager-only, .catalog-manager-only'), function (el) {
        el.style.display = '';
      });
      var hintEl = document.getElementById('accountsHint');
      if (hintEl && currentRole === 'admin') {
        hintEl.textContent = '你可以在這裡新增／停用員工帳號（員工只有日常 CRM 操作權限，不能動商品目錄或管理帳號）。';
      } else if (hintEl) {
        hintEl.textContent = '超級管理者可以管理所有人的帳號，包含老闆跟員工。';
      }
    }
    try {
      await loadSampleTemplates();
    } catch (e) {
      // 標籤讀取失敗不擋主流程，看板頂多先顯示模板代碼
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
  document.getElementById('addCatalogItemBtn').addEventListener('click', function () {
    openCatalogItemDrawer(null);
  });
  document.getElementById('catalogSearch').addEventListener('input', function (e) {
    catalogSearchState.q = e.target.value.trim();
    renderCatalogList();
  });
  document.getElementById('addTemplateBtn').addEventListener('click', function () {
    openTemplateDrawer(null);
  });
  document.getElementById('addAccountBtn').addEventListener('click', function () {
    openAccountDrawer(null);
  });

  init();
})();
