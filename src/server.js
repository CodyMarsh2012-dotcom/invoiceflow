require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const bcrypt = require("bcryptjs");
const multer = require("multer");
const Stripe = require("stripe");

const { db, statements } = require("./db");
const { buildInvoicePdf } = require("./pdf");
const { sendInvoiceEmail } = require("./mailer");

const app = express();
const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const uploadsDir = path.resolve("./public/uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "-");
      cb(null, `${Date.now()}-${cleanName}`);
    }
  })
});

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(
  session({
    store: new FileStore({ path: path.resolve("./data/sessions"), retries: 0 }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(path.resolve("./public")));

function sanitizeInvoicePayload(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const cleanItems = items
    .map((item) => ({
      name: String(item.name || "").trim(),
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0)
    }))
    .filter((item) => item.name && item.quantity > 0);

  const subtotal = cleanItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const tax = Number(body.tax || 0);
  const discount = Number(body.discount || 0);
  const taxAmount = subtotal * (tax / 100);
  const discountAmount = subtotal * (discount / 100);
  const total = Math.max(subtotal + taxAmount - discountAmount, 0);

  return {
    invoice_number: String(body.invoice_number || "").trim(),
    business_name: String(body.business_name || "").trim(),
    business_email: String(body.business_email || "").trim(),
    business_phone: String(body.business_phone || "").trim(),
    business_address: String(body.business_address || "").trim(),
    business_logo: String(body.business_logo || "").trim(),
    client_name: String(body.client_name || "").trim(),
    client_email: String(body.client_email || "").trim(),
    client_address: String(body.client_address || "").trim(),
    issue_date: String(body.issue_date || "").trim(),
    due_date: String(body.due_date || "").trim(),
    tax,
    discount,
    currency: String(body.currency || "USD").trim().toUpperCase(),
    items: cleanItems,
    notes: String(body.notes || "").trim(),
    status: body.status === "paid" ? "paid" : "unpaid",
    subtotal,
    taxAmount,
    discountAmount,
    total
  };
}

function serializeInvoiceRow(row) {
  return {
    ...row,
    items: JSON.parse(row.items_json)
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in to continue." });
  }
  next();
}

function requirePaidPlan(req, res, next) {
  const user = statements.findUserById.get(req.session.userId);
  if (!user || user.plan === "free") {
    return res.status(403).json({ error: "Upgrade to unlock premium features.", upgradeRequired: true });
  }
  req.user = user;
  next();
}

function getCurrentUser(req) {
  if (!req.session.userId) return null;
  return statements.findUserById.get(req.session.userId);
}

function ensureStripe() {
  if (!stripe) {
    const error = new Error("Stripe is not configured. Add your Stripe environment variables.");
    error.statusCode = 500;
    throw error;
  }
}

function getPlanFromPrice(priceId) {
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "InvoiceFlow", now: new Date().toISOString() });
});

app.get("/api/auth/me", (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.json({ user: null });
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      business_name: user.business_name,
      plan: user.plan,
      subscription_status: user.subscription_status
    }
  });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    const business_name = req.body.business_name;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (statements.findUserByEmail.get(email)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = statements.createUser.run({
      email,
      password: hashed,
      business_name: String(business_name || "").trim()
    });

    req.session.userId = result.lastInsertRowid;
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = statements.findUserByEmail.get(String(email || "").trim().toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password || "", user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    req.session.userId = user.id;
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/invoices/next-number", requireAuth, (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = String(Date.now()).slice(-4);
  res.json({ invoiceNumber: `INV-${stamp}-${suffix}` });
});

app.get("/api/invoices", requireAuth, requirePaidPlan, (req, res) => {
  const invoices = statements.listInvoicesForUser.all(req.user.id).map(serializeInvoiceRow);
  res.json({ invoices });
});

app.get("/api/invoices/:id", requireAuth, requirePaidPlan, (req, res) => {
  const row = statements.getInvoiceForUser.get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: "Invoice not found." });
  }
  res.json({ invoice: serializeInvoiceRow(row) });
});

app.post("/api/invoices", requireAuth, requirePaidPlan, (req, res) => {
  const user = req.user || statements.findUserById.get(req.session.userId);
  const invoice = sanitizeInvoicePayload(req.body);

  if (!invoice.business_name || !invoice.client_name || !invoice.issue_date || !invoice.due_date || !invoice.items.length) {
    return res.status(400).json({ error: "Please complete the required invoice fields." });
  }

  const result = statements.createInvoice.run({
    user_id: user.id,
    ...invoice,
    items_json: JSON.stringify(invoice.items)
  });

  res.status(201).json({ id: result.lastInsertRowid });
});

app.put("/api/invoices/:id", requireAuth, requirePaidPlan, (req, res) => {
  const invoice = sanitizeInvoicePayload(req.body);
  const existing = statements.getInvoiceForUser.get(req.params.id, req.user.id);

  if (!existing) {
    return res.status(404).json({ error: "Invoice not found." });
  }

  statements.updateInvoice.run({
    id: req.params.id,
    user_id: req.user.id,
    ...invoice,
    items_json: JSON.stringify(invoice.items)
  });

  res.json({ success: true });
});

app.delete("/api/invoices/:id", requireAuth, requirePaidPlan, (req, res) => {
  statements.deleteInvoice.run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.get("/api/dashboard/summary", requireAuth, requirePaidPlan, (req, res) => {
  const summary = statements.getDashboardSummary.get(req.user.id);
  const invoices = statements.listInvoicesForUser.all(req.user.id).map(serializeInvoiceRow);
  res.json({ summary, invoices });
});

app.post("/api/upload/logo", requireAuth, upload.single("logo"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  res.json({ path: `/uploads/${req.file.filename}` });
});

app.post("/api/invoices/pdf", requireAuth, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const invoice = sanitizeInvoicePayload(req.body);

    if (!invoice.business_name || !invoice.client_name || !invoice.issue_date || !invoice.due_date || !invoice.items.length) {
      return res.status(400).json({ error: "Please complete the required invoice fields before exporting." });
    }

    const exportsUsed = statements.getMonthlyExports.get(user.id).count;
    if (user.plan === "free" && exportsUsed >= 5) {
      return res.status(403).json({ error: "Free plan limit reached. Upgrade for unlimited exports.", upgradeRequired: true });
    }

    const pdfBuffer = await buildInvoicePdf(invoice, { watermark: user.plan === "free" });
    statements.addUsage.run(user.id, "pdf_export");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number || "invoice"}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/send", requireAuth, requirePaidPlan, async (req, res, next) => {
  try {
    const invoice = sanitizeInvoicePayload(req.body);
    if (!invoice.client_email) {
      return res.status(400).json({ error: "Client email is required to send an invoice." });
    }

    const pdfBuffer = await buildInvoicePdf(invoice);
    await sendInvoiceEmail({
      to: invoice.client_email,
      subject: `Invoice ${invoice.invoice_number} from ${invoice.business_name}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2>Your invoice is ready</h2>
          <p>Hello ${invoice.client_name},</p>
          <p>Please find your invoice attached from ${invoice.business_name}.</p>
          <p>Total due: ${invoice.currency} ${invoice.total.toFixed(2)}</p>
        </div>
      `,
      attachment: {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdfBuffer
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/billing/create-checkout-session", requireAuth, async (req, res, next) => {
  try {
    ensureStripe();
    const { plan } = req.body;
    const user = getCurrentUser(req);
    const priceMap = {
      pro: process.env.STRIPE_PRICE_PRO,
      business: process.env.STRIPE_PRICE_BUSINESS
    };
    const price = priceMap[plan];

    if (!price) {
      return res.status(400).json({ error: "Unknown plan." });
    }

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.business_name || user.email
      });
      customerId = customer.id;
      statements.updateUserStripe.run({
        id: user.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: user.stripe_subscription_id || null,
        subscription_status: user.subscription_status || null,
        plan: user.plan
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${baseUrl}/success.html?plan=${plan}`,
      cancel_url: `${baseUrl}/#pricing`,
      allow_promotion_codes: true
    });

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

app.post("/api/billing/create-portal-session", requireAuth, async (req, res, next) => {
  try {
    ensureStripe();
    const user = getCurrentUser(req);
    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: "No Stripe customer found for this account yet." });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/dashboard.html`
    });

    res.json({ url: portal.url });
  } catch (error) {
    next(error);
  }
});

app.post("/api/stripe/webhook", (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(200).json({ skipped: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    stripe.subscriptions.retrieve(subscriptionId).then((subscription) => {
      const priceId = subscription.items.data[0]?.price?.id;
      statements.updateUserPlanByCustomer.run({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: subscription.status,
        plan: getPlanFromPrice(priceId)
      });
    }).catch(() => null);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const plan = event.type === "customer.subscription.deleted" ? "free" : getPlanFromPrice(priceId);

    statements.updateUserPlanByCustomer.run({
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      plan
    });
  }

  res.json({ received: true });
});

app.get(["/", "/login.html", "/register.html", "/create.html", "/dashboard.html", "/success.html"], (_req, res, next) => {
  next();
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error.message || "Something went wrong."
  });
});

app.listen(port, () => {
  console.log(`InvoiceFlow running at ${baseUrl}`);
  console.log(`Database ready at ${path.resolve(process.env.DATABASE_PATH || "./data/invoiceflow.db")}`);
  db.prepare("SELECT 1").get();
});
