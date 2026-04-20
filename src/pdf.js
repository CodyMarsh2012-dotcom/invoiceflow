const PDFDocument = require("pdfkit");

function formatMoney(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD"
  }).format(Number(value || 0));
}

function buildInvoicePdf(invoice, options = {}) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const accent = "#2563EB";
    const green = "#22C55E";
    const text = "#0F172A";
    const muted = "#64748B";

    doc.fillColor(text).fontSize(28).text("Invoice", { align: "right" });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor(accent).text(invoice.business_name || "Your Business");
    doc.fillColor(muted).text(invoice.business_email || "");
    doc.text(invoice.business_phone || "");
    doc.text(invoice.business_address || "");

    doc.moveUp(4);
    doc.fontSize(11).fillColor(text).text(`Invoice #: ${invoice.invoice_number}`);
    doc.text(`Issue date: ${invoice.issue_date}`);
    doc.text(`Due date: ${invoice.due_date}`);
    doc.text(`Status: ${invoice.status || "unpaid"}`, { continued: false });

    doc.moveDown(2);
    doc.fontSize(11).fillColor(muted).text("Bill to");
    doc.fontSize(13).fillColor(text).text(invoice.client_name || "");
    doc.fontSize(11).fillColor(muted).text(invoice.client_email || "");
    doc.text(invoice.client_address || "");

    doc.moveDown(2);
    const tableTop = doc.y;
    doc.fillColor("#E2E8F0").rect(48, tableTop, 500, 26).fill();
    doc.fillColor(text).fontSize(10);
    doc.text("Item", 56, tableTop + 8);
    doc.text("Qty", 310, tableTop + 8, { width: 50, align: "center" });
    doc.text("Price", 370, tableTop + 8, { width: 80, align: "right" });
    doc.text("Total", 458, tableTop + 8, { width: 80, align: "right" });

    let y = tableTop + 34;
    for (const item of invoice.items) {
      const lineTotal = Number(item.quantity) * Number(item.price);
      doc.fillColor(text).fontSize(10);
      doc.text(item.name || "Line item", 56, y, { width: 240 });
      doc.text(String(item.quantity || 0), 310, y, { width: 50, align: "center" });
      doc.text(formatMoney(item.price, invoice.currency), 370, y, { width: 80, align: "right" });
      doc.text(formatMoney(lineTotal, invoice.currency), 458, y, { width: 80, align: "right" });
      y += 24;
    }

    y += 18;
    doc.moveTo(340, y).lineTo(548, y).strokeColor("#CBD5E1").stroke();
    y += 16;

    doc.fillColor(muted).text("Subtotal", 360, y, { width: 90 });
    doc.fillColor(text).text(formatMoney(invoice.subtotal, invoice.currency), 458, y, { width: 80, align: "right" });
    y += 18;
    doc.fillColor(muted).text(`Tax (${invoice.tax}%)`, 360, y, { width: 90 });
    doc.fillColor(text).text(formatMoney(invoice.taxAmount, invoice.currency), 458, y, { width: 80, align: "right" });
    y += 18;
    doc.fillColor(muted).text(`Discount (${invoice.discount}%)`, 360, y, { width: 90 });
    doc.fillColor(text).text(`-${formatMoney(invoice.discountAmount, invoice.currency)}`, 458, y, { width: 80, align: "right" });
    y += 24;

    doc.fillColor(accent).fontSize(14).text("Total", 360, y, { width: 90 });
    doc.fillColor(green).text(formatMoney(invoice.total, invoice.currency), 458, y, { width: 80, align: "right" });

    if (invoice.notes) {
      doc.moveDown(3);
      doc.fillColor(muted).fontSize(11).text("Notes");
      doc.fillColor(text).fontSize(10).text(invoice.notes);
    }

    if (options.watermark) {
      doc.rotate(-25, { origin: [310, 420] });
      doc.fontSize(28).fillColor("rgba(37,99,235,0.16)").text("Created with InvoiceFlow", 120, 430);
      doc.rotate(25, { origin: [310, 420] });
    }

    doc.end();
  });
}

module.exports = { buildInvoicePdf };
