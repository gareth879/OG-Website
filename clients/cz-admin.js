// ============================================================
// OmniGrowth Client Zone — operator/admin console
// ============================================================
import {
  sb, $, $$, esc, toast, money, fmtDate, fmtWhen, fmtNum,
  INVOICE_PILL, TODO_PILL, TODO_LABEL, RESOURCE_META,
  requireSession, loadProfile, signOut, invoiceUrl,
} from './cz-lib.js';

const state = {
  profile: null,
  clients: [],
  clientId: null,
  settings: null,
  resources: [],
  todos: [],
  invoices: [],
  metrics: [],
  threads: [],
  activeThread: null,
  messages: [],
  users: [],
};

const LS_KEY = 'cz-admin-client';

/* ============================================================
   BOOT
   ============================================================ */
(async function boot() {
  const session = await requireSession();
  if (!session) return;

  state.profile = await loadProfile();
  if (!state.profile || state.profile.role !== 'operator') {
    $('#boot').innerHTML =
      `<div class="empty"><div class="big">Operators only</div>
       <p>This console is restricted. <a href="index.html" style="color:var(--blue)">Go to the client zone →</a></p></div>`;
    return;
  }

  const { data: clients, error } = await sb.from('clients')
    .select('id,name,slug,status').order('name');
  if (error) { $('#boot').textContent = error.message; return; }
  state.clients = clients || [];

  if (!state.clients.length) {
    $('#boot').innerHTML = `<div class="empty"><div class="big">No clients yet</div>
      <p>Use the “+ Client” button above to create your first one.</p></div>`;
  }

  renderClientPicker();
  wireUI();

  const saved = localStorage.getItem(LS_KEY);
  const first = state.clients.find((c) => c.id === saved) || state.clients[0];
  if (first) await selectClient(first.id);
  $('#boot').remove();
  $('#view-links').classList.add('active');
  subscribeRealtime();
})();

/* ============================================================
   CLIENT SELECTION
   ============================================================ */
function renderClientPicker() {
  $('#client-picker').innerHTML = state.clients.map((c) =>
    `<option value="${c.id}" ${c.id === state.clientId ? 'selected' : ''}>${esc(c.name)}${c.status !== 'active' ? ' (' + c.status + ')' : ''}</option>`).join('');
}

async function selectClient(id) {
  state.clientId = id;
  localStorage.setItem(LS_KEY, id);
  renderClientPicker();
  await loadClientData();
  renderAll();
}

async function loadClientData() {
  const cid = state.clientId;
  const [settings, resources, todos, invoices, metrics, threads, users] = await Promise.all([
    sb.from('cz_client_settings').select('*').eq('client_id', cid).maybeSingle(),
    sb.from('cz_resources').select('*').eq('client_id', cid).order('kind').order('sort_order'),
    sb.from('cz_todos').select('*').eq('client_id', cid).order('status').order('created_at'),
    sb.from('cz_invoices').select('*').eq('client_id', cid).order('issue_date', { ascending: false }),
    sb.from('cz_metrics').select('*').eq('client_id', cid).order('period_end', { ascending: false }).order('sort_order'),
    sb.from('cz_threads').select('*').eq('client_id', cid).order('last_message_at', { ascending: false }),
    sb.from('profiles').select('id,email,role,client_id').order('email'),
  ]);

  state.settings = settings.data;
  state.resources = resources.data || [];
  state.todos = todos.data || [];
  state.invoices = invoices.data || [];
  state.metrics = metrics.data || [];
  state.threads = threads.data || [];
  state.users = users.data || [];
  state.activeThread = null;
  state.messages = [];
  if (state.threads.length) await openThread(state.threads[0].id, false);
}

function renderAll() {
  renderResources(); renderTodos(); renderInvoices(); renderMetrics();
  renderThreadList(); renderMessages(); renderSettings(); renderUsers(); renderBadges();
}

/* ============================================================
   LINKS
   ============================================================ */
function renderResources() {
  const box = $('#res-list');
  if (!state.resources.length) {
    box.innerHTML = `<div class="empty" style="padding:36px"><p>No links added yet.</p></div>`;
    return;
  }
  box.innerHTML = state.resources.map((r) => `
    <div class="todo">
      <div class="todo-body">
        <div class="todo-title">${esc(r.label)}<span class="pill blue" style="margin-left:8px">${esc(RESOURCE_META[r.kind].title)}</span></div>
        <div class="todo-detail"><a href="${esc(r.url)}" target="_blank" rel="noopener" style="color:var(--blue)">${esc(r.url.slice(0, 60))}${r.url.length > 60 ? '…' : ''}</a></div>
        ${r.description ? `<div class="todo-detail">${esc(r.description)}</div>` : ''}
        <div class="todo-meta">
          <span class="pill ${r.is_active ? 'blue' : 'grey'}">${r.is_active ? 'Visible' : 'Hidden'}</span>
          <button class="btn ghost sm" data-res-toggle="${r.id}">${r.is_active ? 'Hide' : 'Show'}</button>
          <button class="btn ghost sm" data-res-del="${r.id}">Delete</button>
        </div>
      </div>
    </div>`).join('');

  $$('#res-list [data-res-toggle]').forEach((b) => b.onclick = async () => {
    const r = state.resources.find((x) => x.id === b.dataset.resToggle);
    const { error } = await sb.from('cz_resources').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) return toast(error.message);
    r.is_active = !r.is_active; renderResources();
  });
  $$('#res-list [data-res-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Delete this link?')) return;
    const { error } = await sb.from('cz_resources').delete().eq('id', b.dataset.resDel);
    if (error) return toast(error.message);
    state.resources = state.resources.filter((x) => x.id !== b.dataset.resDel);
    renderResources(); toast('Link deleted');
  });
}

/* ============================================================
   TASKS
   ============================================================ */
function renderTodos() {
  const box = $('#todo-list');
  if (!state.todos.length) {
    box.innerHTML = `<div class="empty" style="padding:36px"><p>No tasks yet.</p></div>`;
    return;
  }
  box.innerHTML = state.todos.map((t) => `
    <div class="todo ${t.status === 'done' ? 'done' : ''}">
      <div class="todo-body">
        <div class="todo-title">${esc(t.title)}</div>
        ${t.detail ? `<div class="todo-detail">${esc(t.detail)}</div>` : ''}
        <div class="todo-meta">
          <span class="pill ${t.owner === 'client' ? 'amber' : 'blue'}">${t.owner === 'client' ? 'Client' : 'OmniGrowth'}</span>
          ${t.due_date ? `<span class="pill grey">Due ${fmtDate(t.due_date)}</span>` : ''}
          <select data-todo-status="${t.id}" style="width:auto;padding:5px 8px;font-size:12px">
            ${Object.keys(TODO_LABEL).map((s) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${TODO_LABEL[s]}</option>`).join('')}
          </select>
          <button class="btn ghost sm" data-todo-del="${t.id}">Delete</button>
        </div>
      </div>
    </div>`).join('');

  $$('#todo-list [data-todo-status]').forEach((s) => s.onchange = async () => {
    const id = s.dataset.todoStatus;
    const patch = { status: s.value, completed_at: s.value === 'done' ? new Date().toISOString() : null };
    const { error } = await sb.from('cz_todos').update(patch).eq('id', id);
    if (error) return toast(error.message);
    const t = state.todos.find((x) => x.id === id); Object.assign(t, patch);
    renderTodos();
  });
  $$('#todo-list [data-todo-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Delete this task?')) return;
    const { error } = await sb.from('cz_todos').delete().eq('id', b.dataset.todoDel);
    if (error) return toast(error.message);
    state.todos = state.todos.filter((x) => x.id !== b.dataset.todoDel);
    renderTodos();
  });
}

/* ============================================================
   INVOICES
   ============================================================ */
function renderInvoices() {
  const box = $('#inv-list');
  if (!state.invoices.length) {
    box.innerHTML = `<div class="empty" style="padding:36px"><p>No invoices for this client yet.</p></div>`;
    return;
  }
  box.innerHTML = `
    <table><thead><tr>
      <th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th class="num">Amount</th><th></th>
    </tr></thead><tbody>
      ${state.invoices.map((i) => `<tr>
        <td><strong>${esc(i.number)}</strong>${i.notes ? `<div class="todo-detail">${esc(i.notes)}</div>` : ''}</td>
        <td>${fmtDate(i.issue_date)}</td><td>${fmtDate(i.due_date)}</td>
        <td><select data-inv-status="${i.id}" style="width:auto;padding:5px 8px;font-size:12px">
          ${['draft', 'sent', 'paid', 'overdue', 'void'].map((s) => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td>
        <td class="num">${money(i.amount_cents, i.currency)}</td>
        <td class="num">
          ${i.pdf_path ? `<button class="btn ghost sm" data-pdf="${esc(i.pdf_path)}">PDF</button>` : '<span class="pill grey">No file</span>'}
          <button class="btn ghost sm" data-inv-del="${i.id}">Delete</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;

  $$('#inv-list [data-inv-status]').forEach((s) => s.onchange = async () => {
    const id = s.dataset.invStatus;
    const patch = { status: s.value, paid_at: s.value === 'paid' ? new Date().toISOString() : null };
    const { error } = await sb.from('cz_invoices').update(patch).eq('id', id);
    if (error) return toast(error.message);
    Object.assign(state.invoices.find((x) => x.id === id), patch);
    toast('Invoice updated');
  });
  $$('#inv-list [data-pdf]').forEach((b) => b.onclick = async () => {
    try { window.open(await invoiceUrl(b.dataset.pdf), '_blank'); }
    catch (e) { toast(e.message); }
  });
  $$('#inv-list [data-inv-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Delete this invoice record?')) return;
    const inv = state.invoices.find((x) => x.id === b.dataset.invDel);
    if (inv?.pdf_path) await sb.storage.from('client-files').remove([inv.pdf_path]);
    const { error } = await sb.from('cz_invoices').delete().eq('id', b.dataset.invDel);
    if (error) return toast(error.message);
    state.invoices = state.invoices.filter((x) => x.id !== b.dataset.invDel);
    renderInvoices();
  });
}

/* ============================================================
   METRICS
   ============================================================ */
function renderMetrics() {
  const box = $('#metric-list');
  if (!state.metrics.length) {
    box.innerHTML = `<div class="empty" style="padding:36px"><p>No dashboard data yet.</p></div>`;
    return;
  }
  const periods = [...new Set(state.metrics.map((m) => `${m.period_start}|${m.period_end}`))];
  box.innerHTML = periods.map((p) => {
    const [start, end] = p.split('|');
    const items = state.metrics.filter((m) => m.period_start === start && m.period_end === end);
    return `<div style="margin-bottom:18px">
      <div class="col-title label">${fmtDate(start)} — ${fmtDate(end)}</div>
      <table><tbody>
        ${items.map((m) => `<tr>
          <td><span class="pill ${m.channel === 'meta' ? 'purple' : 'blue'}">${esc(m.channel)}</span></td>
          <td>${esc(m.label)}</td>
          <td class="num"><strong>${esc(fmtNum(m.value, m.unit))}</strong>${m.target ? ` <span style="color:var(--dimmer)">/ ${esc(fmtNum(m.target, m.unit))}</span>` : ''}</td>
          <td class="num"><button class="btn ghost sm" data-m-del="${m.id}">✕</button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }).join('');

  $$('#metric-list [data-m-del]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('cz_metrics').delete().eq('id', b.dataset.mDel);
    if (error) return toast(error.message);
    state.metrics = state.metrics.filter((x) => x.id !== b.dataset.mDel);
    renderMetrics();
  });
}

/* ============================================================
   MESSAGES
   ============================================================ */
function renderThreadList() {
  const list = $('#thread-list');
  if (!state.threads.length) {
    list.innerHTML = `<div class="empty" style="padding:24px"><p>No conversations.</p></div>`;
    return;
  }
  list.innerHTML = state.threads.map((t) => `
    <div class="thread-item ${t.id === state.activeThread ? 'active' : ''}" data-thread="${t.id}">
      <div class="t">${esc(t.subject)}</div>
      <div class="s">${fmtWhen(t.last_message_at)}</div>
    </div>`).join('');
  $$('#thread-list [data-thread]').forEach((n) => n.onclick = () => openThread(n.dataset.thread, true));
}

async function openThread(id, rerender = true) {
  state.activeThread = id;
  const { data } = await sb.from('cz_messages').select('*').eq('thread_id', id).order('created_at');
  state.messages = data || [];
  const unread = state.messages.filter((m) => !m.author_is_operator && !m.read_by_operator_at).map((m) => m.id);
  if (unread.length) {
    await sb.from('cz_messages').update({ read_by_operator_at: new Date().toISOString() }).in('id', unread);
    state.messages.forEach((m) => { if (unread.includes(m.id)) m.read_by_operator_at = new Date().toISOString(); });
  }
  if (rerender) { renderThreadList(); renderMessages(); renderBadges(); }
}

function renderMessages() {
  const box = $('#msg-scroll');
  if (!state.activeThread) {
    box.innerHTML = `<div class="empty"><div class="big">No conversation selected</div></div>`;
    return;
  }
  if (!state.messages.length) { box.innerHTML = `<div class="empty"><p>No messages yet.</p></div>`; return; }
  box.innerHTML = state.messages.map((m) => `
    <div class="bubble ${m.author_is_operator ? 'me' : 'them'}">
      ${esc(m.body).replace(/\n/g, '<br>')}
      <div class="meta">${esc(m.author_name || (m.author_is_operator ? 'OmniGrowth' : 'Client'))} · ${fmtWhen(m.created_at)}</div>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function renderBadges() {
  const unread = state.messages.filter((m) => !m.author_is_operator && !m.read_by_operator_at).length;
  const d = $('#dot-msgs'); d.hidden = unread === 0; d.textContent = unread;
}

/* ============================================================
   SETTINGS & USERS
   ============================================================ */
function renderSettings() {
  $('#set-am').value = state.settings?.account_manager || '';
  $('#set-welcome').value = state.settings?.welcome_note || '';
}

function renderUsers() {
  const box = $('#user-list');
  if (!state.users.length) { box.innerHTML = `<div class="empty" style="padding:24px"><p>No users found.</p></div>`; return; }
  box.innerHTML = `<table><tbody>
    ${state.users.map((u) => `<tr>
      <td>${esc(u.email || u.id.slice(0, 8))}</td>
      <td><select data-u-role="${u.id}" style="width:auto;padding:5px 8px;font-size:12px">
        <option value="client" ${u.role === 'client' ? 'selected' : ''}>Client</option>
        <option value="operator" ${u.role === 'operator' ? 'selected' : ''}>Operator</option>
      </select></td>
      <td><select data-u-client="${u.id}" style="width:auto;padding:5px 8px;font-size:12px">
        <option value="">— no client —</option>
        ${state.clients.map((c) => `<option value="${c.id}" ${u.client_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></td>
    </tr>`).join('')}
  </tbody></table>`;

  const patch = async (id, body) => {
    const { error } = await sb.from('profiles').update(body).eq('id', id);
    if (error) return toast(error.message);
    Object.assign(state.users.find((u) => u.id === id), body);
    toast('Access updated');
  };
  $$('#user-list [data-u-role]').forEach((s) => s.onchange = () => patch(s.dataset.uRole, { role: s.value }));
  $$('#user-list [data-u-client]').forEach((s) => s.onchange = () => patch(s.dataset.uClient, { client_id: s.value || null }));
}

/* ============================================================
   UI WIRING
   ============================================================ */
function wireUI() {
  $('#btn-signout').onclick = signOut;
  $('#client-picker').onchange = (e) => selectClient(e.target.value);

  $$('#tabs .tab').forEach((tab) => tab.onclick = () => {
    $$('#tabs .tab').forEach((t) => t.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    $('#view-' + tab.dataset.view).classList.add('active');
  });

  /* ---- new client ---- */
  $('#btn-new-client').onclick = async () => {
    const name = prompt('Client name');
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await sb.from('clients').insert({ name, slug }).select().single();
    if (error) return toast(error.message);
    state.clients.push(data);
    state.clients.sort((a, b) => a.name.localeCompare(b.name));
    await selectClient(data.id);
    toast('Client created');
  };

  /* ---- links ---- */
  $('#form-res').onsubmit = async (e) => {
    e.preventDefault();
    const row = {
      client_id: state.clientId,
      kind: $('#res-kind').value,
      label: $('#res-label').value.trim(),
      url: $('#res-url').value.trim(),
      description: $('#res-desc').value.trim() || null,
      sort_order: state.resources.length,
    };
    const { data, error } = await sb.from('cz_resources').insert(row).select().single();
    if (error) return toast(error.message);
    state.resources.push(data);
    e.target.reset(); renderResources(); toast('Link added');
  };

  /* ---- tasks ---- */
  $('#form-todo').onsubmit = async (e) => {
    e.preventDefault();
    const row = {
      client_id: state.clientId,
      title: $('#todo-title').value.trim(),
      detail: $('#todo-detail').value.trim() || null,
      owner: $('#todo-owner').value,
      due_date: $('#todo-due').value || null,
      sort_order: state.todos.length,
    };
    const { data, error } = await sb.from('cz_todos').insert(row).select().single();
    if (error) return toast(error.message);
    state.todos.unshift(data);
    e.target.reset(); renderTodos(); toast('Task added');
  };

  /* ---- invoices ---- */
  $('#inv-issue').valueAsDate = new Date();
  $('#form-inv').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#btn-inv'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const file = $('#inv-file').files[0];
      let pdfPath = null;
      if (file) {
        const safe = $('#inv-number').value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
        pdfPath = `${state.clientId}/invoices/${safe}.pdf`;
        const { error: upErr } = await sb.storage.from('client-files')
          .upload(pdfPath, file, { upsert: true, contentType: 'application/pdf' });
        if (upErr) throw upErr;
      }
      const row = {
        client_id: state.clientId,
        number: $('#inv-number').value.trim(),
        amount_cents: Math.round(parseFloat($('#inv-amount').value) * 100),
        currency: $('#inv-currency').value,
        issue_date: $('#inv-issue').value,
        due_date: $('#inv-due').value || null,
        status: $('#inv-status').value,
        notes: $('#inv-notes').value.trim() || null,
        pdf_path: pdfPath,
      };
      const { data, error } = await sb.from('cz_invoices')
        .upsert(row, { onConflict: 'client_id,number' }).select().single();
      if (error) throw error;
      const idx = state.invoices.findIndex((x) => x.id === data.id);
      if (idx >= 0) state.invoices[idx] = data; else state.invoices.unshift(data);
      e.target.reset(); $('#inv-issue').valueAsDate = new Date();
      renderInvoices(); toast('Invoice saved');
    } catch (err) {
      toast(err.message || 'Could not save the invoice');
    }
    btn.disabled = false; btn.textContent = 'Save invoice';
  };

  /* ---- metrics ---- */
  $('#form-metric').onsubmit = async (e) => {
    e.preventDefault();
    const row = {
      client_id: state.clientId,
      channel: $('#m-channel').value,
      metric_key: $('#m-key').value.trim(),
      label: $('#m-label').value.trim(),
      period_start: $('#m-start').value,
      period_end: $('#m-end').value,
      value: parseFloat($('#m-value').value),
      target: $('#m-target').value ? parseFloat($('#m-target').value) : null,
      unit: $('#m-unit').value.trim() || null,
      sort_order: state.metrics.length,
    };
    const { data, error } = await sb.from('cz_metrics')
      .upsert(row, { onConflict: 'client_id,channel,period_start,period_end,metric_key' })
      .select().single();
    if (error) return toast(error.message);
    const idx = state.metrics.findIndex((x) => x.id === data.id);
    if (idx >= 0) state.metrics[idx] = data; else state.metrics.unshift(data);
    renderMetrics(); toast('Metric saved');
  };

  /* ---- settings ---- */
  $('#form-settings').onsubmit = async (e) => {
    e.preventDefault();
    const row = {
      client_id: state.clientId,
      account_manager: $('#set-am').value.trim() || null,
      welcome_note: $('#set-welcome').value.trim() || null,
    };
    const { data, error } = await sb.from('cz_client_settings')
      .upsert(row, { onConflict: 'client_id' }).select().single();
    if (error) return toast(error.message);
    state.settings = data; toast('Settings saved');
  };

  /* ---- messages ---- */
  $('#btn-new-thread').onclick = async () => {
    const subject = prompt('Conversation subject');
    if (!subject) return;
    const { data, error } = await sb.from('cz_threads')
      .insert({ client_id: state.clientId, subject: subject.slice(0, 120) }).select().single();
    if (error) return toast(error.message);
    state.threads.unshift(data);
    await openThread(data.id, true);
  };

  const input = $('#msg-input');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); }
  });

  $('#composer').onsubmit = async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body || !state.activeThread) return;
    $('#btn-send').disabled = true;
    const { data, error } = await sb.from('cz_messages').insert({
      thread_id: state.activeThread,
      client_id: state.clientId,
      author_id: state.profile.id,
      author_name: 'OmniGrowth',
      author_is_operator: true,
      body,
      read_by_operator_at: new Date().toISOString(),
    }).select().single();
    $('#btn-send').disabled = false;
    if (error) return toast(error.message);
    input.value = ''; input.style.height = 'auto';
    if (!state.messages.some((m) => m.id === data.id)) state.messages.push(data);
    renderMessages();
  };
}

/* ============================================================
   REALTIME
   ============================================================ */
function subscribeRealtime() {
  sb.channel('cz-admin')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cz_messages' }, (payload) => {
      const m = payload.new;
      if (m.client_id !== state.clientId) {
        if (!m.author_is_operator) toast('New message from another client');
        return;
      }
      if (m.thread_id === state.activeThread && !state.messages.some((x) => x.id === m.id)) {
        state.messages.push(m); renderMessages();
      }
      const th = state.threads.find((t) => t.id === m.thread_id);
      if (th) { th.last_message_at = m.created_at; state.threads.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)); }
      renderThreadList(); renderBadges();
    })
    .subscribe();
}
