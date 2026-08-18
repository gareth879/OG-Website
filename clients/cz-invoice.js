// ============================================================
// OmniGrowth invoice PDF renderer.
// Reproduces the existing invoice design (A4, dark bands, blue
// accent) so generated invoices are indistinguishable from the
// ones already sent. Runs in the browser — no server needed.
// ============================================================
import { PDFDocument, StandardFonts, rgb } from './vendor/pdf-lib.min.js';

/* ---------- brand ---------- */
const DARK  = rgb(57 / 255, 57 / 255, 56 / 255);
const BLUE  = rgb(9 / 255, 142 / 255, 239 / 255);
const GREY  = rgb(243 / 255, 243 / 255, 244 / 255);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
const MID   = rgb(0.13, 0.13, 0.13);

/* ---------- page geometry (points) ---------- */
const W = 595.28, H = 841.89;
const M_L = 62, M_R = 548;          // text margins
const BAND_L = 19, BAND_R = 576;    // dark band extents

/* ---------- helpers ---------- */
export function formatMoney(cents, currency = 'USD') {
  const v = (Number(cents) || 0) / 100;
  const sym = { USD: '$', ZAR: 'R', GBP: '£', EUR: '€' }[currency] || (currency + ' ');
  return sym + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function monthLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

export function longDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// pdf-lib has no letter-spacing, and the original leans on it heavily
function tracked(page, text, { x, y, font, size, color, tracking = 0, align = 'left' }) {
  const chars = [...String(text)];
  const width = chars.reduce((w, c) => w + font.widthOfTextAtSize(c, size) + tracking, 0) - tracking;
  let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  for (const c of chars) {
    page.drawText(c, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(c, size) + tracking;
  }
  return width;
}

// rounded rectangle as an SVG path, y measured down from the top of the page
function roundedPath(x, yTop, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return `M ${x + rr} ${yTop} H ${x + w - rr} A ${rr} ${rr} 0 0 1 ${x + w} ${yTop + rr}` +
         ` V ${yTop + h - rr} A ${rr} ${rr} 0 0 1 ${x + w - rr} ${yTop + h}` +
         ` H ${x + rr} A ${rr} ${rr} 0 0 1 ${x} ${yTop + h - rr}` +
         ` V ${yTop + rr} A ${rr} ${rr} 0 0 1 ${x + rr} ${yTop} Z`;
}

/* ============================================================
   MAIN
   ============================================================ */
export async function renderInvoicePdf(invoice, settings, logoBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const top = (y) => H - y;   // convert "distance from top" to PDF coords

  /* ---------- header ---------- */
  // full-width bar across the top, then a tab hanging down on the left
  // drawSvgPath's origin is the page bottom by default; anchor it to the top so
  // the geometry below can be written as plain distance-from-top measurements
  const svg = (d) => page.drawSvgPath(d, { x: 0, y: H, color: DARK, borderWidth: 0 });
  svg(roundedPath(BAND_L, -16, BAND_R - BAND_L, 46, 14));
  svg(roundedPath(BAND_L, -16, 322, 130, 22));

  if (logoBytes) {
    try {
      const logo = await doc.embedPng(logoBytes);
      const h = 38, w = h * (logo.width / logo.height);
      page.drawImage(logo, { x: M_L, y: top(96), width: w, height: h });
    } catch { /* logo is decorative — never block an invoice over it */ }
  }

  tracked(page, 'INVOICE', { x: M_R + 12, y: top(96), font: bold, size: 33, color: BLACK, tracking: 3.6, align: 'right' });

  /* ---------- meta + bill to ---------- */
  const metaY = 172;
  tracked(page, 'INVOICE #', { x: M_L, y: top(metaY), font: bold, size: 12, color: BLACK, tracking: 0.8 });
  page.drawText(String(invoice.number), { x: M_L + 82, y: top(metaY), size: 12, font: bold, color: BLACK });

  tracked(page, 'INVOICE DATE', { x: M_L, y: top(metaY + 32), font: bold, size: 10, color: BLACK, tracking: 0.6 });
  page.drawText(':', { x: M_L + 80, y: top(metaY + 32), size: 10, font: bold, color: BLACK });
  page.drawText(longDate(new Date(invoice.issue_date + 'T00:00:00')), {
    x: M_L + 94, y: top(metaY + 32), size: 10, font: bold, color: BLACK,
  });

  const BX = 333;
  tracked(page, 'BILL TO', { x: BX, y: top(metaY), font: bold, size: 12, color: BLACK, tracking: 0.8 });
  page.drawText(String(invoice.bill_to_name || ''), { x: BX, y: top(metaY + 32), size: 10, font: bold, color: BLACK });
  String(invoice.bill_to_address || '').split('\n').filter(Boolean).forEach((line, i) => {
    page.drawText(line, { x: BX, y: top(metaY + 52 + i * 13.5), size: 10, font: bold, color: BLACK });
  });

  /* ---------- line items ---------- */
  const HDR_Y = 285, HDR_H = 27.5;
  page.drawRectangle({ x: 0, y: top(HDR_Y + HDR_H), width: W, height: HDR_H, color: BLUE });
  tracked(page, 'NO', { x: 44.5, y: top(HDR_Y + 18.5), font: bold, size: 10.5, color: BLACK, tracking: 0.8 });
  tracked(page, 'DESCRIPTION', { x: 89.7, y: top(HDR_Y + 18.5), font: bold, size: 10.5, color: BLACK, tracking: 0.8 });
  tracked(page, 'TOTAL', { x: M_R, y: top(HDR_Y + 18.5), font: bold, size: 10.5, color: BLACK, tracking: 0.8, align: 'right' });

  const items = Array.isArray(invoice.line_items) && invoice.line_items.length
    ? invoice.line_items
    : [{ description: '', amount_cents: invoice.amount_cents }];

  const ROW_TOP = 318, BAND_H = 31.4, PITCH = 35.35, SLOTS = Math.max(5, items.length);
  for (let i = 0; i < SLOTS; i++) {
    const y = ROW_TOP + i * PITCH;
    page.drawRectangle({ x: 0, y: top(y + BAND_H), width: W, height: BAND_H, color: GREY });
    const it = items[i];
    if (!it) continue;
    const ty = top(y + 20);
    page.drawText(String(i + 1), { x: 47, y: ty, size: 10, font: bold, color: BLACK });
    tracked(page, String(it.description || '').toUpperCase(), { x: 89.7, y: ty, font: bold, size: 10, color: BLACK, tracking: 0.5 });
    page.drawText(formatMoney(it.amount_cents, invoice.currency), {
      x: M_R - bold.widthOfTextAtSize(formatMoney(it.amount_cents, invoice.currency), 10),
      y: ty, size: 10, font: bold, color: BLACK,
    });
  }

  /* ---------- total ---------- */
  const TOT_Y = ROW_TOP + SLOTS * PITCH + 8, TOT_H = 28.8;
  page.drawRectangle({ x: 351.5, y: top(TOT_Y + TOT_H), width: W - 351.5, height: TOT_H, color: BLUE });
  tracked(page, 'Total Due', { x: 373, y: top(TOT_Y + 19), font: bold, size: 12.5, color: BLACK, tracking: 0.5 });
  const total = items.reduce((s, i) => s + (Number(i.amount_cents) || 0), 0);
  const totalStr = formatMoney(total, invoice.currency);
  page.drawText(totalStr, { x: M_R - bold.widthOfTextAtSize(totalStr, 12.5), y: top(TOT_Y + 19), size: 12.5, font: bold, color: BLACK });

  /* ---------- payment method ---------- */
  let y = Math.max(TOT_Y + TOT_H + 80, 607);
  tracked(page, 'PAYMENT METHOD', { x: M_L, y: top(y), font: bold, size: 11.5, color: BLACK, tracking: 0.6 });
  const pay = [
    ['Bank', settings.bank_name],
    ['Account Name', settings.account_name],
    ['Account Number', settings.account_number],
    ['Swift Code', settings.swift_code],
  ];
  pay.forEach(([k, v], i) => {
    const ry = top(y + 19 + i * 15.7);
    tracked(page, k, { x: M_L, y: ry, font: reg, size: 9.2, color: MID, tracking: 0.5 });
    page.drawText(':', { x: M_L + 98, y: ry, size: 9.2, font: reg, color: MID });
    tracked(page, String(v || ''), { x: M_L + 114, y: ry, font: reg, size: 9.2, color: MID, tracking: 0.5 });
  });

  y += 19 + 4 * 15.7 + 14;
  tracked(page, 'TERM AND CONDITIONS', { x: M_L, y: top(y), font: bold, size: 11.5, color: BLACK, tracking: 0.6 });
  page.drawText(String(settings.terms || ''), { x: M_L, y: top(y + 19), size: 9.2, font: reg, color: MID });

  tracked(page, String(settings.thank_you || ''), {
    x: W / 2, y: top(y + 58), font: bold, size: 11.5, color: BLACK, tracking: 0.6, align: 'center',
  });

  /* ---------- footer ---------- */
  const F_TOP = 771;
  svg(roundedPath(BAND_L, F_TOP, BAND_R - BAND_L, H - F_TOP + 24, 22));
  tracked(page, `${settings.address_line} - ${settings.phone}`, {
    x: W / 2, y: top(F_TOP + 33), font: reg, size: 9.8, color: WHITE, tracking: 0.9, align: 'center',
  });
  tracked(page, String(settings.email || ''), {
    x: W / 2, y: top(F_TOP + 49), font: reg, size: 9.8, color: WHITE, tracking: 0.9, align: 'center',
  });

  return doc.save();
}

/* Mirrors the existing file naming: "Schema Networks July Invoice 26141.pdf" */
export function invoiceFilename(invoice) {
  const d = new Date(invoice.issue_date + 'T00:00:00');
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const name = String(invoice.bill_to_name || 'Client').replace(/[^A-Za-z0-9 ]/g, '').trim();
  return `${name} ${month} Invoice ${invoice.number}.pdf`;
}
