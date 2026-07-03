# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Medivex Biotech Distribution ERP — a multi-page, no-build, vanilla HTML/CSS/JS app backed by Supabase (Postgres + Auth). There is no bundler, no transpiler, no framework, and no test suite. Each page is a standalone HTML file that loads its own paired `.js` file via plain `<script>` tags, in dependency order.

## Running it

There is no build/lint/test command. `package.json` lists `@supabase/supabase-js` and `@supabase/ssr` as dependencies but **the app does not import or use them** — every page instead loads the Supabase client from a CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`). The npm packages appear vestigial; don't assume `node_modules` is part of the runtime.

To work on this locally, serve the directory with any static file server (e.g. `npx serve .`) and open `index.html` / `login.html`. Opening via `file://` may work for most things but is not guaranteed (Supabase calls go over HTTPS regardless, but stay safe and use a server).

## Script loading pattern

Every protected page loads, in order:
```
@supabase/supabase-js (CDN) → supabase-config.js → auth.js → <page-specific.js>
```
`supabase-config.js` creates the Supabase client and exposes it as `window.MVB_DB`, plus builds `window.MEDIVEX_PRODUCTS` and `window.MEDIVEX_SUPPLIER_DIRECTORY` from the `products` table (used by the invoice/supplier-order forms). `auth.js` is the gatekeeper (see below) and runs on every page except `login.html`.

Heavy assets (pdf-lib, the base64-encoded PDF templates in `logo-data.js` and `grn-template-data.js`, JSZip) are **not** loaded up front — they're injected via a `loadScript()` helper only when a page actually needs to generate a PDF/zip, to keep initial page loads light.

`grn-pdf.js` is the one genuinely shared module: both `grn.js` (Purchasing → GRN) and `inbound.js` load it for PDF generation and formatting helpers (`window.GrnPdf`). Everything else duplicates its own copies of `formatAmount`/`formatQuantity`/`escapeHtml`/`pad`/`toInputDate` — `customers.js` and `suppliers.js` are near-byte-identical CRUD modules (client/contact/phone vs name/contact/phone). If you fix a formatting bug in one file, check whether the same logic is duplicated elsewhere (`app.js`, `supplier-orders.js`, `customer-orders.js`, `outbound.js`, `invoice-pdf.js`, `grn-pdf.js` all have their own copies).

## Auth & authorization model

Two layers, and they are **not** the same thing:

1. **Postgres RLS (the real security boundary).** Defined across `migration-auth.sql` and `migration-auth-update.sql`. Roles live in `user_roles` (`id` = `auth.users.id`, `role`, `name`). Roles: `admin`, `manager`, `ceo`, `tech_lead`. SQL helper functions `is_power_user()` (manager/ceo/tech_lead) and `is_admin_user()` gate every table's RLS policies.
   - `manager`/`ceo`/`tech_lead` ("power users"): full CRUD on everything.
   - `admin`: can only *insert* into invoices/customer orders/supplier orders/GRNs/customers/suppliers, and *read* most tables — cannot update/delete, cannot read `products` at all except via the admin-read policy added later for lookups.
   - A user with no `user_roles` row is signed out automatically on next page load.

2. **Frontend gating (`auth.js`, UX only — not a security boundary).**
   - Loads the caller's role, updates the sidebar (name/initials/role), wires the settings button to sign-out.
   - If `role === 'admin'`: hides every `[data-power-only]` sidebar item, adds `body.is-admin`, and hard-redirects away from `RESTRICTED_PAGES` (`product-dashboard.html`, `inbound.html`, `outbound.html`) to `invoice-generator.html`.
   - **Master Control Access (MCA) lock**: for power users only. A session-scoped soft-lock (`sessionStorage`, resets every browser session) that starts locked and adds `body.is-locked`, which via CSS hides delete buttons, disables save-all buttons, and makes stock-edit inputs inert. Clicking the lock icon in the sidebar footer unlocks it for the rest of the session. This exists purely to stop accidental destructive clicks — power users already have full RLS access regardless of lock state, so don't treat `is-locked` as a permission check when reasoning about what data a role *can* reach.

`login.html` handles both normal email/password sign-in and the Supabase invite-link flow (detects `#access_token&type=invite` in the URL hash, shows a "set password" form, calls `auth.updateUser`).

## Data model

There is no single schema file — the schema is the union of the original (undocumented, pre-migration) tables plus these sequential SQL scripts, **which must be read/applied in this order** on a fresh project:

1. `migration-auth.sql` — creates `user_roles`, RLS helper functions, and locks down `products`, `suppliers`, `customers`, `invoices`, `invoice_line_items`, `customer_orders`, `customer_order_items`, `supplier_orders`, `supplier_order_items`, `grns` to power-user-only.
2. `migration-auth-update.sql` — layers `admin` read/insert-only policies on top.
3. `migration-inbound.sql` — adds `grns.status` (`pending`/`confirmed`) for the two-step GRN→Inbound confirmation flow.
4. `migration-stock.sql` — (re)adds `products.stock_quantity` (resets to 0) + admin update policy for stock deduction at invoice time.
5. `migration-supplier-foc.sql` — adds `supplier_order_items.foc`.
6. `migration-variant-price.sql` — adds `products.variant_price` (optional alternate/legacy MRP price).
7. `migration-grn-remark.sql` — adds `supplier_orders.grn_remark` (used to mark GRN-rejected orders).
8. `migration-outbound-backfill.sql` — one-time backfill marking pre-existing `customer_orders` as `outbound_confirmed = true` (they predate the outbound workflow).

These are plain scripts pasted into the Supabase SQL editor by hand — there's no migration runner or tracking table, so don't assume re-running one is idempotent beyond what each script's own `if not exists`/`if exists` guards provide.

Core tables, reconstructed from migrations + the queries in the JS files (not exhaustive on every column):
- **products** — `id, supplier, name, unit_cost, unit_price, variant_price, stock_quantity, updated_at`. `supplier` is a free-text field that *should* match a `suppliers.name` but can drift (the product-dashboard UI tolerates and preserves orphaned values).
- **suppliers** — `id, name, contact, phone`.
- **customers** — `id, client, contact, phone`.
- **supplier_orders** — `id, supplier_name, catalog_supplier, order_date, reference, vat_enabled, subtotal, vat_total, net_total, total_quantity, grn_id, grn_remark, created_at`.
- **supplier_order_items** — `id, order_id, product_name, unit_cost, quantity, foc, subtotal, vat, net`.
- **grns** — `id, batch_date, order_count, total_items, net_total, status, confirmed_at`.
- **customer_orders** — `id, order_number, invoice_number, invoice_date, due_date, billed_to, total_amount, item_count, status ('Unpaid'/'Paid'), outbound_confirmed, created_at`.
- **customer_order_items** — `id, order_id, product_name, unit_price, quantity, foc, amount`.
- **invoices / invoice_line_items** — written by `MVB_PRICE_STORE.saveInvoice` in `supabase-config.js`, but nothing currently calls that function; `customer_orders`/`customer_order_items` is what `invoice-generator.js` actually persists to. Treat `invoices`/`invoice_line_items` as legacy/unused unless you find a new caller.
- **user_roles** — see Auth section above.

Products are looked up **by name**, not by a stable foreign key, in the stock-mutation code paths (GRN confirm in `inbound.js`, dispatch confirm in `outbound.js`). If duplicate product names ever exist, both/all matching rows get the stock delta applied.

## Core business workflows

**Sales / outbound (stock decreases):**
`invoice-generator.html` → builds an invoice from `window.MEDIVEX_PRODUCTS`, generates a PDF via `invoice-pdf.js` (pdf-lib + `logo-data.js`), and on download also inserts into `customer_orders`/`customer_order_items` (status `Unpaid`) → `customer-orders.html` lets you mark Paid/Unpaid, re-download the PDF, or delete (only while `outbound_confirmed` is false) → `outbound.html` lists orders where `outbound_confirmed` is not true; "Confirm Dispatch" first checks `products.stock_quantity` is sufficient for *every* line item (all-or-nothing, no partial fulfillment), then deducts stock and sets `outbound_confirmed = true`; "Reject" hard-deletes the order and its items.

**Purchasing / inbound (stock increases):**
`supplier-orders.html` → builds a supplier order from the catalog in `window.MEDIVEX_SUPPLIER_DIRECTORY` (derived from `products` rows that have both `supplier` and `unit_cost` set), with an optional flat 18% VAT toggle (`VAT_RATE` constant) computed per line → `grn.html` lists supplier orders with `grn_id IS NULL AND grn_remark IS NULL`; selecting orders and clicking "Generate GRN" renders one PDF per order via `grn-pdf.js` (overlaying data onto the template embedded in `grn-template-data.js`, 6 line items per note/page, multiple orders get zipped client-side with JSZip), then "Save to Inbound" inserts `grns` rows with `status = 'pending'` and stamps `grn_id` back onto the supplier order → `inbound.html` lists `grns` where `status = 'pending'`; "Confirm GRN" sets `status = 'confirmed'` + `confirmed_at` and increments `products.stock_quantity` per line item (`quantity + foc`); "Reject" deletes the `grns` row and sets the supplier order's `grn_id = null`, `grn_remark = 'GRN Rejected'` (which keeps it out of the GRN-pending list going forward, since that query also filters on `grn_remark IS NULL`).

**Inventory:**
`product-dashboard.html` (inline `<script>` at the bottom of the file, not a separate `.js`) — full CRUD on `products`, with a "dirty row" pattern: edits accumulate in a `pendingUpdates` map and are only sent on "Save Changes". `stock-levels.html`/`stock-levels.js` reuses the same dirty-row + single "Save All" pattern for `stock_quantity` only.

PDF generation for invoices and GRNs are two independent pdf-lib pipelines (`invoice-pdf.js` and `grn-pdf.js` respectively) — they don't share code beyond both depending on the locally-vendored `assets/vendor/pdf-lib.min.js`. GRN PDFs are overlaid onto a real PDF template (decoded from a base64 data URL in `grn-template-data.js`) using absolute-coordinate cell drawing helpers (`drawTextInCell`, `coverCell`); invoice PDFs are drawn from scratch.


Key things future agents will need that aren't obvious from skimming individual files:


No build system — package.json deps are unused; everything loads via CDN <script> tags. Just serve statically.
Two-layer auth — Postgres RLS (is_power_user()/is_admin_user()) is the real boundary; the frontend "Master Control Access" lock is a session-scoped UX guard only, not a permission check.
Schema only exists as 8 sequential migration scripts — no single schema file, and they must be applied in order.
The two core workflows (sales→outbound stock deduction, purchasing→GRN→inbound stock increment) span 3-4 files each and aren't obvious without tracing the grn_id/grn_remark/outbound_confirmed state machine across tables.
Stock mutations match products by name, not ID — a sharp edge if duplicate names ever exist.
Heavy duplication (customers.js/suppliers.js near-identical; formatting helpers copy-pasted across 6+ files) flagged so a future refactor doesn't miss instances.