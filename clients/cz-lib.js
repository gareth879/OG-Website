// ============================================================
// Shared helpers for the OmniGrowth Client Zone
// ============================================================
// Bundled locally so the portal has no third-party runtime dependency.
import { createClient } from './vendor/supabase-js.min.js';
import { SUPABASE_URL, SUPABASE_KEY } from './cz-config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ---------- tiny DOM helpers ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, ms = 2600) {
  const prev = $('.toast');
  if (prev) prev.remove();
  const node = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(node);
  setTimeout(() => node.remove(), ms);
}

/* ---------- formatting ---------- */
export function money(cents, currency = 'ZAR') {
  const v = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
}

export function fmtNum(n, unit) {
  const num = Number(n) || 0;
  const s = Number.isInteger(num) ? num.toLocaleString('en-ZA') : num.toFixed(1);
  if (unit === '%') return `${s}%`;
  if (unit === 'R') return `R${s}`;
  return unit ? `${s} ${unit}` : s;
}

/* ---------- status pills ---------- */
export const INVOICE_PILL = {
  draft: 'grey', sent: 'blue', paid: 'green', overdue: 'red', void: 'grey',
};

export const TODO_PILL = {
  todo: 'grey', in_progress: 'blue', blocked: 'red', done: 'green',
};

export const TODO_LABEL = {
  todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done',
};

export const RESOURCE_META = {
  drive:      { icon: '📁', title: 'Shared Drive' },
  creatives:  { icon: '🎨', title: 'Creatives' },
  recordings: { icon: '🎥', title: 'Meeting Recordings' },
  report:     { icon: '📊', title: 'Reports' },
  other:      { icon: '🔗', title: 'Links' },
};

/* ---------- session ---------- */
export async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.replace('login.html');
    return null;
  }
  return session;
}

export async function loadProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, role, client_id, email')
    .eq('id', (await sb.auth.getUser()).data.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signOut() {
  await sb.auth.signOut();
  window.location.replace('login.html');
}

/* ---------- invoice download ---------- */
export async function invoiceUrl(path) {
  const { data, error } = await sb.storage
    .from('client-files')
    .createSignedUrl(path, 120, { download: true });
  if (error) throw error;
  return data.signedUrl;
}
