// ============================================================
// OmniGrowth Client Zone — client-facing app
// ============================================================
import {
  sb, $, $$, el, esc, toast, money, fmtDate, fmtWhen, fmtNum,
  INVOICE_PILL, TODO_PILL, TODO_LABEL, RESOURCE_META,
  requireSession, loadProfile, signOut, invoiceUrl,
} from './cz-lib.js';

const state = {
  profile: null,
  client: null,
  settings: null,
  resources: [],
  todos: [],
  invoices: [],
  metrics: [],
  threads: [],
  activeThread: null,
  messages: [],
};

/* ============================================================
   BOOT
   ============================================================ */
(async function boot() {
  const session = await requireSession();
  if (!session) return;

  try {
    state.profile = await loadProfile();
  } catch (e) {
    fatal('We could not load your profile. ' + e.message);
    return;
  }

  if (!state.profile) { fatal('No profile is linked to this login yet. Contact your account manager.'); return; }

  if (state.profile.role === 'operator') $('#link-admin').hidden = false;

  if (!state.profile.client_id) {
    // Operators have no client of their own — send them straight to the console.
    if (state.profile.role === 'operator') { window.location.replace('admin.html'); return; }
    fatal('Your login is not attached to a client account yet. Contact your account manager.');
    return;
  }

  await loadAll();
  $('#boot').remove();
  renderAll();
  wireUI();
  subscribeRealtime();
})();

function fatal(msg) {
  $('#boot').innerHTML =
    `<div class="empty"><div class="big">Something's not right</div><p>${esc(msg)}</p>
     <p style="margin-top:18px"><button class="btn ghost sm" id="f-out">Sign out</button></p></div>`;
  $('#f-out').onclick = signOut;
}

/* ============================================================
   DATA
   ============================================================ */
async function loadAll() {
  const cid = state.profile.client_id;
  const [client, settings, resources, todos, invoices, metrics, threads] = await Promise.all([
    sb.from('clients').select('id,name,slug,status').eq('id', cid).maybeSingle(),
    sb.from('cz_client_settings').select('*').eq('client_id', cid).maybeSingle(),
    sb.from('cz_resources').select('*').eq('client_id', cid).order('kind').order('sort_order'),
    sb.from('cz_todos').select('*').eq('client_id', cid).order('status').order('sort_order').order('created_at'),
    sb.from('cz_invoices').select('*').eq('client_id', cid).order('issue_date', { ascending: false }),
    sb.from('cz_metrics').select('*').eq('client_id', cid).order('period_end', { ascending: false }).order('sort_order'),
    sb.from('cz_threads').select('*').eq('client_id', cid).order('last_message_at', { ascending: false }),
  ]);

  state.client = client.data;
  state.settings = settings.data;
  state.resources = resources.data || [];
  state.todos = todos.data || [];
  state.invoices = invoices.data || [];
  state.metrics = metrics.data || [];
  state.threads = threads.data || [];

  if (state.threads.length) await openThread(state.threads[0].id, false);
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() {
  $('#who-client').innerHTML = `<strong>${esc(state.client?.name || 'Client')}</strong>`;
  $('#who-email').textContent = state.profile.email || '';
  renderHome();
  renderDashboard();
  renderTasks();
  renderInvoices();
  renderThreadList();
  renderMessages();
  renderBadges();
  $('#view-home').classList.add('active');
}

/* ---------- home ---------- */
function renderHome() {
  $('#home-title').textContent = (state.client?.name || 'WELCOME').toUpperCase();
  $('#home-sub').textContent = state.settings?.account_manager
    ? `Your account manager: ${state.settings.account_manager}`
    : 'Everything we are building for you, in one place.';

  $('#home-welcome').innerHTML = state.settings?.welcome_note
    ? `<div class="card" style="margin-bottom:20px">${esc(state.settings.welcome_note).replace(/\n/g, '<br>')}</div>`
    : '';

  const open = state.todos.filter((t) => t.status !== 'done');
  const yours = open.filter((t) => t.owner === 'client').length;
  const unpaid = state.invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  const unpaidTotal = unpaid.reduce((s, i) => s + Number(i.amount_cents || 0), 0);

  const summary = `
    <div class="grid c3" style="margin-bottom:24px">
      <div class="stat"><div class="k">Open tasks</div><div class="v">${open.length}</div>
        <div class="sub">${yours} waiting on you</div></div>
      <div class="stat"><div class="k">Outstanding</div><div class="v">${money(unpaidTotal, unpaid[0]?.currency || 'ZAR')}</div>
        <div class="sub">${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="k">Conversations</div><div class="v">${state.threads.length}</div>
        <div class="sub">Message us any time</div></div>
    </div>`;

  const active = state.resources.filter((r) => r.is_active);
  let links = '';
  if (!active.length) {
    links = `<div class="empty"><div class="big">No links yet</div>
      <p>Your shared drive, creatives and recordings will appear here.</p></div>`;
  } else {
    const order = ['drive', 'creatives', 'recordings', 'report', 'other'];
    links = order.map((kind) => {
      const items = active.filter((r) => r.kind === kind);
      if (!items.length) return '';
      const meta = RESOURCE_META[kind];
      return `
        <h2 class="group-head">${esc(meta.title.toUpperCase())}</h2>
        <div class="grid c3">
          ${items.map((r) => `
            <a class="res-card" href="${esc(r.url)}" target="_blank" rel="noopener">
              <h3>${esc(r.label)}</h3>
              ${r.description ? `<p>${esc(r.description)}</p>` : ''}
              <span class="go">Open →</span>
            </a>`).join('')}
        </div>`;
    }).join('');
  }

  $('#home-resources').innerHTML = summary + links;
}

/* ---------- dashboard ---------- */
function renderDashboard() {
  const body = $('#dash-body');
  if (!state.metrics.length) {
    $('#dash-period').textContent = '';
    body.innerHTML = `<div class="empty"><div class="big">Reporting is being set up</div>
      <p>Your email and Meta campaign numbers will appear here each reporting period.</p></div>`;
    return;
  }

  const latest = state.metrics[0].period_end;
  const current = state.metrics.filter((m) => m.period_end === latest);
  $('#dash-period').textContent =
    `${fmtDate(current[0].period_start)} — ${fmtDate(latest)}`;

  const groups = [
    ['email', 'Email campaigns'],
    ['meta', 'Meta ads'],
    ['other', 'Other'],
  ];

  body.innerHTML = groups.map(([channel, title]) => {
    const items = current.filter((m) => m.channel === channel);
    if (!items.length) return '';
    return `
      <h2 class="group-head">${esc(title.toUpperCase())}</h2>
      <div class="grid c4">
        ${items.map((m) => {
          const pct = m.target ? Math.min(100, (Number(m.value) / Number(m.target)) * 100) : null;
          return `<div class="stat">
            <div class="k">${esc(m.label)}</div>
            <div class="v">${esc(fmtNum(m.value, m.unit))}</div>
            ${pct !== null
              ? `<div class="sub">${Math.round(pct)}% of target ${esc(fmtNum(m.target, m.unit))}</div>
                 <div class="bar"><i style="width:${pct}%"></i></div>`
              : '<div class="sub">&nbsp;</div>'}
          </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

/* ---------- tasks ---------- */
function renderTasks() {
  const cols = [
    ['omnigrowth', 'With OmniGrowth'],
    ['client', 'With you'],
  ];
  $('#tasks-body').innerHTML = cols.map(([owner, title]) => {
    const items = state.todos.filter((t) => t.owner === owner);
    const openCount = items.filter((t) => t.status !== 'done').length;
    return `<div>
      <div class="col-title label">${esc(title)} — ${openCount} open</div>
      ${items.length ? items.map((t) => todoRow(t, owner === 'client')).join('')
        : '<div class="empty" style="padding:30px"><p>Nothing here right now.</p></div>'}
    </div>`;
  }).join('');

  $$('#tasks-body .todo-check').forEach((btn) => {
    btn.onclick = () => toggleTodo(btn.dataset.id);
  });
}

function todoRow(t, editable) {
  const done = t.status === 'done';
  const overdue = t.due_date && !done && new Date(t.due_date) < new Date();
  return `
    <div class="todo ${done ? 'done' : ''}">
      <button class="todo-check ${done ? 'on' : ''}" data-id="${t.id}" ${editable ? '' : 'disabled'}
              title="${editable ? 'Mark complete' : 'Only OmniGrowth can update this item'}">✓</button>
      <div class="todo-body">
        <div class="todo-title">${esc(t.title)}</div>
        ${t.detail ? `<div class="todo-detail">${esc(t.detail)}</div>` : ''}
        <div class="todo-meta">
          <span class="pill ${TODO_PILL[t.status]}">${esc(TODO_LABEL[t.status])}</span>
          ${t.due_date ? `<span class="pill ${overdue ? 'red' : 'grey'}">Due ${fmtDate(t.due_date)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

async function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  const next = t.status === 'done' ? 'todo' : 'done';
  const { error } = await sb.from('cz_todos').update({ status: next }).eq('id', id);
  if (error) { toast('Could not update: ' + error.message); return; }
  t.status = next;
  renderTasks();
  renderBadges();
  renderHome();
}

/* ---------- invoices ---------- */
function renderInvoices() {
  const unpaid = state.invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  const total = unpaid.reduce((s, i) => s + Number(i.amount_cents || 0), 0);
  $('#inv-outstanding').innerHTML = unpaid.length
    ? `<div class="stat" style="padding:14px 20px"><div class="k">Outstanding</div>
       <div class="v" style="font-size:30px">${money(total, unpaid[0].currency)}</div></div>`
    : '';

  if (!state.invoices.length) {
    $('#invoices-body').innerHTML =
      `<div class="empty"><div class="big">No invoices yet</div><p>Invoices we issue will appear here.</p></div>`;
    return;
  }

  $('#invoices-body').innerHTML = `
    <table class="stack-table">
      <thead><tr>
        <th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th>
        <th class="num">Amount</th><th></th>
      </tr></thead>
      <tbody>
        ${state.invoices.map((i) => {
          const overdue = i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date();
          const status = overdue ? 'overdue' : i.status;
          return `<tr>
            <td data-l="Invoice"><strong>${esc(i.number)}</strong>${i.notes ? `<div class="todo-detail">${esc(i.notes)}</div>` : ''}</td>
            <td data-l="Issued">${fmtDate(i.issue_date)}</td>
            <td data-l="Due">${fmtDate(i.due_date)}</td>
            <td data-l="Status"><span class="pill ${INVOICE_PILL[status]}">${esc(status)}</span></td>
            <td class="num" data-l="Amount">${money(i.amount_cents, i.currency)}</td>
            <td class="num">${i.pdf_path
              ? `<button class="btn ghost sm" data-pdf="${esc(i.pdf_path)}">PDF ↓</button>`
              : '<span class="pill grey">No file</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  $$('#invoices-body [data-pdf]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        window.open(await invoiceUrl(b.dataset.pdf), '_blank');
      } catch (e) { toast('Could not open the PDF: ' + e.message); }
      b.disabled = false;
    };
  });
}

/* ---------- messages ---------- */
function renderThreadList() {
  const list = $('#thread-list');
  if (!state.threads.length) {
    list.innerHTML = `<div class="empty" style="padding:24px"><p>No conversations yet.</p></div>`;
    return;
  }
  list.innerHTML = state.threads.map((t) => `
    <div class="thread-item ${t.id === state.activeThread ? 'active' : ''}" data-thread="${t.id}">
      <div class="t">${esc(t.subject)}</div>
      <div class="s">${fmtWhen(t.last_message_at)}</div>
    </div>`).join('');
  $$('#thread-list [data-thread]').forEach((n) => {
    n.onclick = () => openThread(n.dataset.thread, true);
  });
}

async function openThread(id, rerender = true) {
  state.activeThread = id;
  const { data, error } = await sb.from('cz_messages')
    .select('*').eq('thread_id', id).order('created_at');
  if (error) { toast(error.message); return; }
  state.messages = data || [];
  markRead();
  if (rerender) { renderThreadList(); renderMessages(); renderBadges(); }
}

function renderMessages() {
  const box = $('#msg-scroll');
  if (!state.activeThread) {
    box.innerHTML = `<div class="empty"><div class="big">Start a conversation</div>
      <p>Click “New conversation” to send us a message.</p></div>`;
    return;
  }
  if (!state.messages.length) {
    box.innerHTML = `<div class="empty"><p>No messages yet — say hello.</p></div>`;
    return;
  }
  box.innerHTML = state.messages.map((m) => `
    <div class="bubble ${m.author_id === state.profile.id ? 'me' : 'them'}">
      ${esc(m.body).replace(/\n/g, '<br>')}
      <div class="meta">${esc(m.author_name || (m.author_is_operator ? 'OmniGrowth' : 'You'))} · ${fmtWhen(m.created_at)}</div>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;
}

async function markRead() {
  const unread = state.messages.filter((m) => m.author_is_operator && !m.read_by_client_at).map((m) => m.id);
  if (!unread.length) return;
  await sb.from('cz_messages').update({ read_by_client_at: new Date().toISOString() }).in('id', unread);
  state.messages.forEach((m) => { if (unread.includes(m.id)) m.read_by_client_at = new Date().toISOString(); });
}

function renderBadges() {
  const openMine = state.todos.filter((t) => t.owner === 'client' && t.status !== 'done').length;
  const dt = $('#dot-tasks');
  dt.hidden = openMine === 0; dt.textContent = openMine;

  const unread = state.messages.filter((m) => m.author_is_operator && !m.read_by_client_at).length;
  const dm = $('#dot-msgs');
  dm.hidden = unread === 0; dm.textContent = unread;
}

/* ============================================================
   UI WIRING
   ============================================================ */
function wireUI() {
  $('#btn-signout').onclick = signOut;

  $$('#tabs .tab').forEach((tab) => {
    tab.onclick = () => {
      $$('#tabs .tab').forEach((t) => t.classList.remove('active'));
      $$('.view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      $('#view-' + tab.dataset.view).classList.add('active');
      if (tab.dataset.view === 'messages') { markRead().then(renderBadges); }
    };
  });

  $('#btn-new-thread').onclick = async () => {
    const subject = prompt('What is this conversation about?');
    if (!subject) return;
    const { data, error } = await sb.from('cz_threads')
      .insert({ client_id: state.profile.client_id, subject: subject.slice(0, 120) })
      .select().single();
    if (error) { toast(error.message); return; }
    state.threads.unshift(data);
    await openThread(data.id, true);
    $('#msg-input').focus();
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
    if (!body) return;
    if (!state.activeThread) { toast('Start a conversation first.'); return; }
    $('#btn-send').disabled = true;
    const { data, error } = await sb.from('cz_messages').insert({
      thread_id: state.activeThread,
      client_id: state.profile.client_id,
      author_id: state.profile.id,
      author_name: state.profile.email,
      author_is_operator: false,
      body,
    }).select().single();
    $('#btn-send').disabled = false;
    if (error) { toast(error.message); return; }
    input.value = ''; input.style.height = 'auto';
    if (!state.messages.some((m) => m.id === data.id)) state.messages.push(data);
    renderMessages();
  };
}

/* ============================================================
   REALTIME
   ============================================================ */
function subscribeRealtime() {
  sb.channel('cz-client-' + state.profile.client_id)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'cz_messages', filter: `client_id=eq.${state.profile.client_id}` },
      (payload) => {
        const m = payload.new;
        if (m.thread_id === state.activeThread) {
          if (!state.messages.some((x) => x.id === m.id)) state.messages.push(m);
          renderMessages();
          markRead();
        }
        const th = state.threads.find((t) => t.id === m.thread_id);
        if (th) { th.last_message_at = m.created_at; state.threads.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)); }
        renderThreadList();
        renderBadges();
      })
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'cz_todos', filter: `client_id=eq.${state.profile.client_id}` },
      async () => {
        const { data } = await sb.from('cz_todos').select('*')
          .eq('client_id', state.profile.client_id)
          .order('status').order('sort_order').order('created_at');
        state.todos = data || [];
        renderTasks(); renderBadges(); renderHome();
      })
    .subscribe();
}
