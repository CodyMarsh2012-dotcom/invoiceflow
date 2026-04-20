# InvoiceFlow

InvoiceFlow is a complete SaaS invoicing app for freelancers and small businesses. It includes:

- Landing page, auth flow, invoice generator, and dashboard
- SQLite database with session auth
- Stripe subscriptions for `pro` and `business`
- PDF invoice export with free-plan watermarking
- Save, edit, delete, and email invoice workflows

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your secrets.

3. Start the app:

```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000)

## Demo account

Register a new account from the UI. Free accounts can export 5 watermarked invoices each month. `pro` and `business` can save and email invoices.

## Stripe setup

- Create two recurring monthly Prices in Stripe for `pro` and `business`
- Add them to `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS`
- Point your Stripe webhook to `/api/stripe/webhook`
- Listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

## Project structure

- `src/server.js`: Express app, routes, auth, billing, paywall logic
- `src/db.js`: SQLite initialization and schema
- `src/pdf.js`: Invoice PDF generation
- `src/mailer.js`: SMTP mailer
- `public/`: Static frontend pages and client-side JavaScript
