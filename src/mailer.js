const nodemailer = require("nodemailer");

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendInvoiceEmail({ to, subject, html, attachment }) {
  const transporter = createTransport();
  if (!transporter) {
    throw new Error("Email is not configured. Add SMTP settings to your .env file.");
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "InvoiceFlow <hello@invoiceflow.local>",
    to,
    subject,
    html,
    attachments: attachment ? [attachment] : []
  });
}

module.exports = { sendInvoiceEmail };
