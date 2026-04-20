const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = process.env.DATABASE_PATH || "./data/invoiceflow.db";
const resolvedPath = path.resolve(databasePath);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new DatabaseSync(resolvedPath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    business_name TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    invoice_number TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_email TEXT,
    business_phone TEXT,
    business_address TEXT,
    business_logo TEXT,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_address TEXT,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    tax REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    items_json TEXT NOT NULL,
    notes TEXT,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'unpaid',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invoice_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const statements = {
  createUser: db.prepare(`
    INSERT INTO users (email, password, business_name)
    VALUES (@email, @password, @business_name)
  `),
  findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  updateUserStripe: db.prepare(`
    UPDATE users
    SET stripe_customer_id = @stripe_customer_id,
        stripe_subscription_id = @stripe_subscription_id,
        subscription_status = @subscription_status,
        plan = @plan
    WHERE id = @id
  `),
  updateUserPlanByCustomer: db.prepare(`
    UPDATE users
    SET stripe_subscription_id = @stripe_subscription_id,
        subscription_status = @subscription_status,
        plan = @plan
    WHERE stripe_customer_id = @stripe_customer_id
  `),
  createInvoice: db.prepare(`
    INSERT INTO invoices (
      user_id, invoice_number, business_name, business_email, business_phone,
      business_address, business_logo, client_name, client_email, client_address,
      issue_date, due_date, tax, discount, currency, items_json, notes, total, status
    ) VALUES (
      @user_id, @invoice_number, @business_name, @business_email, @business_phone,
      @business_address, @business_logo, @client_name, @client_email, @client_address,
      @issue_date, @due_date, @tax, @discount, @currency, @items_json, @notes, @total, @status
    )
  `),
  listInvoicesForUser: db.prepare(`
    SELECT * FROM invoices WHERE user_id = ? ORDER BY datetime(created_at) DESC
  `),
  getInvoiceForUser: db.prepare(`
    SELECT * FROM invoices WHERE id = ? AND user_id = ?
  `),
  updateInvoice: db.prepare(`
    UPDATE invoices
    SET invoice_number = @invoice_number,
        business_name = @business_name,
        business_email = @business_email,
        business_phone = @business_phone,
        business_address = @business_address,
        business_logo = @business_logo,
        client_name = @client_name,
        client_email = @client_email,
        client_address = @client_address,
        issue_date = @issue_date,
        due_date = @due_date,
        tax = @tax,
        discount = @discount,
        currency = @currency,
        items_json = @items_json,
        notes = @notes,
        total = @total,
        status = @status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND user_id = @user_id
  `),
  deleteInvoice: db.prepare(`DELETE FROM invoices WHERE id = ? AND user_id = ?`),
  addUsage: db.prepare(`INSERT INTO invoice_usage (user_id, action) VALUES (?, ?)`),
  getMonthlyExports: db.prepare(`
    SELECT COUNT(*) AS count
    FROM invoice_usage
    WHERE user_id = ?
      AND action = 'pdf_export'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
  `),
  getDashboardSummary: db.prepare(`
    SELECT
      COUNT(*) AS total_invoices,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
      SUM(CASE WHEN status != 'paid' THEN 1 ELSE 0 END) AS unpaid_count,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) AS revenue
    FROM invoices
    WHERE user_id = ?
  `)
};

module.exports = { db, statements };
