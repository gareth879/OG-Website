// ============================================================
// Invoice generation for the admin console: per-client templates,
// gapless numbering, PDF rendering, batch runs and CSV export.
// ============================================================
import { sb, $, $$, esc, toast, money, fmtDate } from './cz-lib.js';
import { renderInvoicePdf, invoiceFilename, monthLabel } from './cz-invoice.js';

let LOGO = null;
async function logoBytes() {
  if (LOGO) return LOGO;
  try {
    LOGO = new Uint8Array(await (await fetch('invoice-logo.png')).arrayBuffer());
  } catch { LOGO = null; }
  return LOGO;
}

export async function loadBillingSettings() {
  const { data, error } = await sb.from('cz_billing_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadTemplate(clientId) {
  const { data } = await sb.from('cz_invoice_templates').select('*').eq('client_id', clientId).maybeSingle();
  return data;
}

export async function saveTemplate(row) {
  const { data, error } = await sb.from('cz_invoice_templates')
    .upsert(row, { onConflict: 'client_id' }).select().single();
  if (error) throw error;
  return data;
}

/* period is a yyyy-mm string; returns e.g. "JULY 2026" */
export function describePeriod(template, period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return String(template?.description_template || '{MONTH} {YYYY}')
    .replace('{MONTH}', d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase())
    .replace('{YYYY}', String(y))
    .replace('{MONTH_YEAR}', monthLabel(d));
}

/* ============================================================
   GENERATE
   The invoice row is written first so a failed upload leaves a
   recoverable draft rather than burning a number and vanishing.
   ============================================================ */
export async function generateInvoice({ clientId, template, settings, period, issueDate, amountCents, description }) {
  // check for a clash BEFORE allocating a number, otherwise a rejected insert
  // burns the number and leaves a permanent gap in the sequence
  if (period) {
    const { data: clash } = await sb.from('cz_invoices')
      .select('number').eq('client_id', clientId).eq('period', period).limit(1);
    if (clash && clash.length) {
      throw new Error(`${template.bill_to_name || 'This client'} already has invoice ${clash[0].number} for ${period}.`);
    }
  }

  const { data: num, error: numErr } = await sb.rpc('cz_next_invoice_number');
  if (numErr) throw new Error('Could not allocate an invoice number: ' + numErr.message);
  const number = String(num);

  const issue = issueDate || new Date().toISOString().slice(0, 10);
  const due = new Date(issue + 'T00:00:00');
  due.setDate(due.getDate() + (settings.overdue_after_days ?? 7));

  const items = [{
    description: description || describePeriod(template, period),
    amount_cents: Number(amountCents ?? template.default_amount_cents) || 0,
  }];

  const row = {
    client_id: clientId,
    number,
    issue_date: issue,
    due_date: due.toISOString().slice(0, 10),
    amount_cents: items.reduce((s, i) => s + i.amount_cents, 0),
    currency: template.currency || 'USD',
    status: 'draft',
    bill_to_name: template.bill_to_name,
    bill_to_address: template.bill_to_address,
    line_items: items,
    issuer: {
      business_name: settings.business_name, address_line: settings.address_line,
      phone: settings.phone, email: settings.email,
      bank_name: settings.bank_name, account_name: settings.account_name,
      account_number: settings.account_number, swift_code: settings.swift_code,
    },
    generated_at: new Date().toISOString(),
    period: period || null,
    notes: items[0].description,
  };

  const { data: inv, error: insErr } = await sb.from('cz_invoices').insert(row).select().single();
  if (insErr) {
    if (/cz_invoices_client_period_key/.test(insErr.message || '')) {
      throw new Error(`This client already has an invoice for ${period}. Void it first if you need to reissue.`);
    }
    throw new Error('Could not save the invoice: ' + insErr.message);
  }

  const bytes = await renderInvoicePdf(inv, settings, await logoBytes());
  const path = `${clientId}/invoices/${number}.pdf`;
  const { error: upErr } = await sb.storage.from('client-files')
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
  if (upErr) throw new Error(`Invoice ${number} was saved but the PDF upload failed: ${upErr.message}`);

  await sb.from('cz_invoices').update({ pdf_path: path }).eq('id', inv.id);
  return { ...inv, pdf_path: path };
}

/* Re-render an existing invoice from its own stored snapshot */
export async function regeneratePdf(invoice, settings) {
  const src = invoice.issuer ? { ...settings, ...invoice.issuer } : settings;
  const bytes = await renderInvoicePdf(invoice, src, await logoBytes());
  const path = invoice.pdf_path || `${invoice.client_id}/invoices/${invoice.number}.pdf`;
  const { error } = await sb.storage.from('client-files')
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
  if (!invoice.pdf_path) await sb.from('cz_invoices').update({ pdf_path: path }).eq('id', invoice.id);
  return path;
}

export async function downloadPdfLocally(invoice, settings) {
  const src = invoice.issuer ? { ...settings, ...invoice.issuer } : settings;
  const bytes = await renderInvoicePdf(invoice, src, await logoBytes());
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = invoiceFilename(invoice);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================================================
   BATCH — every recurring client that has no invoice for the period
   ============================================================ */
export async function generateMonthlyBatch(period, settings, onProgress) {
  const { data: templates, error } = await sb.from('cz_invoice_templates').select('*').eq('is_recurring', true);
  if (error) throw error;

  const results = [];
  for (const t of (templates || [])) {
    const description = describePeriod(t, period);
    const { data: existing } = await sb.from('cz_invoices')
      .select('id, number').eq('client_id', t.client_id).eq('period', period).limit(1);
    if (existing && existing.length) {
      results.push({ client_id: t.client_id, skipped: `already invoiced (${existing[0].number})` });
      onProgress?.(results);
      continue;
    }
    try {
      const inv = await generateInvoice({
        clientId: t.client_id, template: t, settings, period,
        issueDate: `${period}-01`, amountCents: t.default_amount_cents, description,
      });
      results.push({ client_id: t.client_id, number: inv.number });
    } catch (e) {
      results.push({ client_id: t.client_id, error: e.message });
    }
    onProgress?.(results);
  }
  return results;
}

/* ============================================================
   CSV — the portal is the book of record, so this has to exist
   ============================================================ */
export async function invoicesCsv(clients) {
  const { data, error } = await sb.from('cz_invoices')
    .select('number,issue_date,due_date,client_id,bill_to_name,notes,amount_cents,currency,status,paid_at')
    .order('number');
  if (error) throw error;
  const nameOf = (id) => (clients.find((c) => c.id === id) || {}).name || '';
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['Invoice', 'Issue date', 'Due date', 'Client', 'Billed to', 'Description', 'Amount', 'Currency', 'Status', 'Paid at'];
  const rows = (data || []).map((i) => [
    i.number, i.issue_date, i.due_date, nameOf(i.client_id), i.bill_to_name, i.notes,
    ((Number(i.amount_cents) || 0) / 100).toFixed(2), i.currency, i.status, i.paid_at || '',
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

export function downloadCsv(csv, filename) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
