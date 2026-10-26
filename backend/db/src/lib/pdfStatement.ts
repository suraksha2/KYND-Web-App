import PDFDocument from 'pdfkit';

// Server-rendered payout statement (A4 PDF) for GET /vendor/payouts/:id/statement
// and the superadmin side. Built with pdfkit — no headless browser, per
// VENDOR_DASHBOARD_PLAN.md ("evaluate a small lib").

const COLORS = {
  terracotta: '#A95F45',
  charcoal: '#2B2926',
  warmgrey: '#70685E',
  lightstone: '#D6CEC2',
  sage: '#7A8D72',
  warmlinen: '#F5F1EA',
};

const PAGE = { width: 595, height: 842, margin: 50 };
const CONTENT_RIGHT = PAGE.width - PAGE.margin; // 545
const TABLE_BOTTOM = PAGE.height - PAGE.margin - 40;

export interface StatementJob {
  day: string; // "6 Oct"
  service: string;
  customer: string;
  gross: number;
  net: number;
}

export interface StatementInput {
  payoutRef: string; // e.g. "PO-000042"
  generated: string; // "Generated 10 Oct 2026"
  vendorName: string;
  vendorEmail?: string | null;
  vendorMobile?: string | null;
  vendorCity?: string | null;
  period: string; // "6 Oct – 12 Oct 2026"
  status: string; // "Paid" / "Pending" / "Scheduled"
  statusNote?: string | null; // "Paid 15 Oct 2026" / "Expected 15 Oct 2026"
  jobs: StatementJob[];
  totalGross: number;
  totalNet: number;
}

function money(n: number): string {
  return `S$${Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Column x/width inside the 50..545 content area.
const COLS = {
  date: { x: 50, w: 62 },
  service: { x: 118, w: 168 },
  customer: { x: 292, w: 98 },
  gross: { x: 392, w: 48 },
  net: { x: 444, w: 101 },
} as const;

export function buildPayoutStatementPdf(input: StatementInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    info: { Title: `Payout statement ${input.payoutRef}`, Author: 'Kynd' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ---- Header -------------------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(26).fillColor(COLORS.terracotta).text('kynd', PAGE.margin, 46);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.warmgrey)
    .text('PAYOUT STATEMENT', 0, 52, { width: CONTENT_RIGHT - PAGE.margin, align: 'right', characterSpacing: 1.5 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.charcoal)
    .text(input.payoutRef, 0, 66, { width: CONTENT_RIGHT - PAGE.margin, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.warmgrey)
    .text(input.generated, 0, 80, { width: CONTENT_RIGHT - PAGE.margin, align: 'right' });

  doc.moveTo(PAGE.margin, 100).lineTo(CONTENT_RIGHT, 100)
    .lineWidth(1).strokeColor(COLORS.lightstone).stroke();

  // ---- Vendor + payout blocks ---------------------------------------------
  const blockTop = 116;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.warmgrey)
    .text('PAID TO', PAGE.margin, blockTop, { characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.charcoal)
    .text(input.vendorName, PAGE.margin, blockTop + 12);
  const vendorLine = [input.vendorEmail, input.vendorMobile, input.vendorCity].filter(Boolean).join('  ·  ');
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.warmgrey)
    .text(vendorLine || '—', PAGE.margin, blockTop + 27, { width: 250 });

  const midX = 330;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.warmgrey)
    .text('PAYOUT PERIOD', midX, blockTop, { characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.charcoal)
    .text(input.period, midX, blockTop + 12);
  doc.font('Helvetica').fontSize(8.5)
    .fillColor(input.status === 'Paid' ? COLORS.sage : COLORS.warmgrey)
    .text(input.statusNote ? `${input.status} · ${input.statusNote}` : input.status, midX, blockTop + 27);

  // ---- Jobs table ----------------------------------------------------------
  const header = (y: number) => {
    doc.rect(PAGE.margin, y, CONTENT_RIGHT - PAGE.margin, 18).fill(COLORS.warmlinen);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.warmgrey);
    doc.text('DATE', COLS.date.x, y + 6, { width: COLS.date.w });
    doc.text('JOB', COLS.service.x, y + 6, { width: COLS.service.w });
    doc.text('CUSTOMER', COLS.customer.x, y + 6, { width: COLS.customer.w });
    doc.text('GROSS', COLS.gross.x, y + 6, { width: COLS.gross.w, align: 'right' });
    doc.text('NET', COLS.net.x, y + 6, { width: COLS.net.w, align: 'right' });
    return y + 18;
  };

  let y = header(168);
  const rowHeight = 20;

  if (input.jobs.length === 0) {
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.warmgrey)
      .text('No jobs in this payout yet.', PAGE.margin, y + 12, { width: CONTENT_RIGHT - PAGE.margin, align: 'center' });
    y += rowHeight * 2;
  }

  input.jobs.forEach((job, i) => {
    if (y + rowHeight > TABLE_BOTTOM) {
      doc.addPage();
      y = header(PAGE.margin);
    }
    if (i % 2 === 0) {
      doc.rect(PAGE.margin, y, CONTENT_RIGHT - PAGE.margin, rowHeight)
        .fill('#FBF9F5');
    }
    const ty = y + 6;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.charcoal);
    doc.text(job.day, COLS.date.x, ty, { width: COLS.date.w });
    doc.text(job.service, COLS.service.x, ty, { width: COLS.service.w, ellipsis: true });
    doc.font('Helvetica').fillColor(COLORS.warmgrey)
      .text(job.customer, COLS.customer.x, ty, { width: COLS.customer.w, ellipsis: true });
    doc.fillColor(COLORS.charcoal);
    doc.text(money(job.gross), COLS.gross.x, ty, { width: COLS.gross.w, align: 'right' });
    doc.fillColor(COLORS.charcoal)
      .text(money(job.net), COLS.net.x, ty, { width: COLS.net.w, align: 'right' });
    y += rowHeight;
  });

  // ---- Totals ---------------------------------------------------------------
  doc.moveTo(PAGE.margin, y).lineTo(CONTENT_RIGHT, y).lineWidth(1).strokeColor(COLORS.lightstone).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.charcoal)
    .text(`${input.jobs.length} job${input.jobs.length === 1 ? '' : 's'}`, COLS.date.x, y, { width: COLS.service.w + COLS.date.w });
  doc.text('Total', COLS.customer.x, y, { width: COLS.customer.w, align: 'right' });
  doc.text(money(input.totalGross), COLS.gross.x, y, { width: COLS.gross.w, align: 'right' });
  doc.fontSize(10).fillColor(COLORS.terracotta).text(money(input.totalNet), COLS.net.x, y, { width: COLS.net.w, align: 'right' });

  // ---- Footer ---------------------------------------------------------------
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.warmgrey).text(
    'Payouts are batched weekly (Mon–Sun) and typically land within 3 working days of the period end.',
    PAGE.margin,
    PAGE.height - PAGE.margin - 26,
    { width: CONTENT_RIGHT - PAGE.margin, align: 'left' }
  );

  doc.end();
  return finished;
}
