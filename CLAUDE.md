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
@supabase/supabase-js (CDN) → supabase-config.js → auth.js → audit-log.js → <page-specific.js>
```
`supabase-config.js` creates the Supabase client and exposes it as `window.MVB_DB`, plus builds `window.MEDIVEX_PRODUCTS` and `window.MEDIVEX_SUPPLIER_DIRECTORY` from the `products` table (used by the invoice/supplier-order forms). `auth.js` is the gatekeeper (see below) and runs on every page except `login.html`. `audit-log.js` exposes `window.MVB_AUDIT_LOG.log(...)` — a fire-and-forget helper every mutation-performing module calls after a successful create/update/delete to write a row to `audit_logs` (see User Activity Log below). `login.html` doesn't load `auth.js` (it's the one page you can reach unauthenticated) but still loads `audit-log.js` to log Login/Invite-Accepted events itself.

Heavy assets (pdf-lib, the base64-encoded PDF templates in `logo-data.js` and `grn-template-data.js`, JSZip) are **not** loaded up front — they're injected via a `loadScript()` helper only when a page actually needs to generate a PDF/zip, to keep initial page loads light.

`grn-pdf.js` is the one genuinely shared module: both `grn.js` (Purchasing → GRN) and `inbound.js` load it for PDF generation and formatting helpers (`window.GrnPdf`). Everything else duplicates its own copies of `formatAmount`/`formatQuantity`/`escapeHtml`/`pad`/`toInputDate` — `customers.js` and `suppliers.js` are near-byte-identical modules (client/contact/phone vs name/contact/phone) supporting create + inline edit (dirty-row + "Save Changes", same pattern as `product-dashboard.html`) — there is no delete; see Auth & authorization model. If you fix a formatting bug in one file, check whether the same logic is duplicated elsewhere (`app.js`, `supplier-orders.js`, `customer-orders.js`, `outbound.js`, `invoice-pdf.js`, `grn-pdf.js` all have their own copies).

## Auth & authorization model

Two layers, and they are **not** the same thing:

1. **Postgres RLS (the real security boundary).** Defined across `migration-auth.sql`, `migration-auth-update.sql`, `migration-admin-permissions.sql`, and `migration-no-delete-directory.sql`. Roles live in `user_roles` (`id` = `auth.users.id`, `role`, `name`). Roles: `admin`, `manager`, `ceo`, `tech_lead`. SQL helper functions `is_power_user()` (manager/ceo/tech_lead) and `is_admin_user()` gate every table's RLS policies.
   - `manager`/`ceo`/`tech_lead` ("power users"): full CRUD on everything, **except** `customers`/`suppliers` where delete has been removed for every role (see below) — power users still get select/insert/update there.
   - `admin`: full update/delete parity with power users on the Sales & Purchasing tables (`customer_orders`, `customer_order_items`, `supplier_orders`, `supplier_order_items`, `invoices`, `invoice_line_items`), and select/insert/update (no delete — see below) on `customers`/`suppliers` — page-level business rules (e.g. "can't delete a dispatch-confirmed order", "can't delete a GRN-confirmed supplier order") are enforced in the page JS only, same as for power users. Admin is strictly *read-only* on `products` (no insert/update/delete at all, per `migration-admin-permissions.sql`) and has *read + insert only* on `grns` (can save a GRN to Inbound from `grn.html`, but cannot confirm/reject one).
   - `customers`/`suppliers` have **no delete policy for any role** (`migration-no-delete-directory.sql`) — both tables are referenced by name (not a foreign key) from orders/invoices/products, so deleting a row would orphan those references. `customers.js`/`suppliers.js` only expose create + inline edit; there is no delete button in the UI at all, for any role.
   - A user with no `user_roles` row is signed out automatically on next page load.

2. **Frontend gating (`auth.js`, UX only — not a security boundary).**
   - Loads the caller's role, updates the sidebar (name/initials/role), wires the settings button to sign-out.
   - If `role === 'admin'`: hides every `[data-power-only]` sidebar item (currently just the Reports/Activity Log section — Activity Log is the one page admin shouldn't even know exists) and hard-redirects away from `RESTRICTED_PAGES` (`logs.html`) to `invoice-generator.html`. Admin *can* reach the Inventory pages (`inbound.html`, `outbound.html`, `product-dashboard.html`, `stock-levels.html`) but each renders in a read-only mode gated on `window.MVB_USER.role === 'admin'`: Inbound/Outbound swap the Confirm/Reject buttons for a "Pending manager approval" badge, and Products/Stock levels hide the add/save controls and disable every editable cell — backed by the fact that admin has no RLS write access to `products`/`grns` at all, so this is belt-and-suspenders, not the only thing stopping a write.
   - Note the one deliberate seam: `customer_orders` and `supplier_orders` are shared between Sales/Purchasing pages (where admin has full RLS update/delete) and Inventory pages (Outbound's "Reject" deletes a `customer_orders` row; Inbound's "Reject" updates a `supplier_orders` row) — RLS can't distinguish which page issued the call, so that specific boundary is frontend-only (the buttons simply don't render for admin), consistent with how other per-workflow rules in this app are already JS-enforced rather than RLS-encoded.
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
9. `migration-audit-log.sql` — creates `audit_logs` (append-only, no update/delete policy for anyone) and adds a `power read all` select policy on `user_roles` (previously power users could only read their own row) so the log viewer's user filter can list names.
10. `migration-admin-permissions.sql` — grants `admin` full update/delete parity with power users on the Sales & Purchasing tables (`customers`, `suppliers`, `customer_orders(_items)`, `supplier_orders(_items)`, `invoices`, `invoice_line_items`); drops the old blanket "admin update products stock" policy from `migration-stock.sql` so `admin` is strictly read-only on `products`.
11. `migration-no-delete-directory.sql` — removes delete entirely from `customers` and `suppliers` for **every** role, including power users (supersedes the delete grants from steps 1 and 10 on those two tables). They're referenced by name from orders/invoices/products, not a foreign key, so deleting one would orphan existing records; edit is still allowed for everyone with directory access.

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
- **audit_logs** — `id, created_at, user_id, user_name, user_role, module, action, record_type, record_id, description, old_data, new_data, success`. Append-only (no update/delete RLS policy exists for anyone, including power users); `module`/`action`/`record_type` are free text, not enums, so new modules can log through the same table without a migration.

Products are looked up **by name**, not by a stable foreign key, in the stock-mutation code paths (GRN confirm in `inbound.js`, dispatch confirm in `outbound.js`). If duplicate product names ever exist, both/all matching rows get the stock delta applied.

## Core business workflows

**Sales / outbound (stock decreases):**
`invoice-generator.html` → builds an invoice from `window.MEDIVEX_PRODUCTS`, generates a PDF via `invoice-pdf.js` (pdf-lib + `logo-data.js`), and on download also inserts into `customer_orders`/`customer_order_items` (status `Unpaid`) → `customer-orders.html` lets you mark Paid/Unpaid, re-download the PDF, or delete (only while `outbound_confirmed` is false) → `outbound.html` lists orders where `outbound_confirmed` is not true; "Confirm Dispatch" first checks `products.stock_quantity` is sufficient for *every* line item (all-or-nothing, no partial fulfillment), then deducts stock and sets `outbound_confirmed = true`; "Reject" hard-deletes the order and its items.

**Purchasing / inbound (stock increases):**
`supplier-orders.html` → builds a supplier order from the catalog in `window.MEDIVEX_SUPPLIER_DIRECTORY` (derived from `products` rows that have both `supplier` and `unit_cost` set), with an optional flat 18% VAT toggle (`VAT_RATE` constant) computed per line → `grn.html` lists supplier orders with `grn_id IS NULL AND grn_remark IS NULL`; selecting orders and clicking "Generate GRN" renders one PDF per order via `grn-pdf.js` (overlaying data onto the template embedded in `grn-template-data.js`, 6 line items per note/page, multiple orders get zipped client-side with JSZip), then "Save to Inbound" inserts `grns` rows with `status = 'pending'` and stamps `grn_id` back onto the supplier order → `inbound.html` lists `grns` where `status = 'pending'`; "Confirm GRN" sets `status = 'confirmed'` + `confirmed_at` and increments `products.stock_quantity` per line item (`quantity + foc`); "Reject" deletes the `grns` row and sets the supplier order's `grn_id = null`, `grn_remark = 'GRN Rejected'` (which keeps it out of the GRN-pending list going forward, since that query also filters on `grn_remark IS NULL`).

**Inventory:**
`product-dashboard.html` (inline `<script>` at the bottom of the file, not a separate `.js`) — full CRUD on `products`, with a "dirty row" pattern: edits accumulate in a `pendingUpdates` map and are only sent on "Save Changes". `stock-levels.html`/`stock-levels.js` reuses the same dirty-row + single "Save All" pattern for `stock_quantity` only.

PDF generation for invoices and GRNs are two independent pdf-lib pipelines (`invoice-pdf.js` and `grn-pdf.js` respectively) — they don't share code beyond both depending on the locally-vendored `assets/vendor/pdf-lib.min.js`. GRN PDFs are overlaid onto a real PDF template (decoded from a base64 data URL in `grn-template-data.js`) using absolute-coordinate cell drawing helpers (`drawTextInCell`, `coverCell`); invoice PDFs are drawn from scratch.

**Reports / User Activity Log (audit trail):**
`logs.html`/`logs.js` (sidebar: Reports → Activity Log) is a power-user-only viewer over `audit_logs` — the only page still in `auth.js`'s `RESTRICTED_PAGES` (admins get redirected away and don't even see it in the sidebar; the real boundary is the `power read` RLS policy). Unlike every other page, it does **not** load the whole table into memory — filters/sort/pagination are all applied server-side via the Supabase query builder (`.gte`/`.lte`/`.eq`/`.or`/`.order`/`.range`) since the log is retained indefinitely and can grow unbounded. "Export to Excel" lazy-loads SheetJS from CDN (same `loadScript()` pattern as `jszip` in `grn.js`) and re-runs the current filter without the page `range()` (capped at 5000 rows).

Every mutation-performing module (`customers.js`, `suppliers.js`, `product-dashboard.html`, `stock-levels.js`, `supplier-orders.js`, `grn.js`, `inbound.js`, `outbound.js`, `customer-orders.js`, `app.js`, `auth.js`, `login.html`) calls `window.MVB_AUDIT_LOG.log({module, action, recordType, recordId, description, oldData, newData})` immediately after a mutation succeeds — **without** awaiting it, so a slow or failing audit insert never blocks or delays the primary operation. Two things are deliberately **not** logged: failed login attempts (no session exists yet, and RLS requires `user_id = auth.uid()`, so the client can never write that row — there's no backend to do it another way) and in-app user-management events (there is no in-app user-management UI; roles are assigned directly in the Supabase dashboard).


Key things future agents will need that aren't obvious from skimming individual files:


No build system — package.json deps are unused; everything loads via CDN <script> tags. Just serve statically.
Two-layer auth — Postgres RLS (is_power_user()/is_admin_user()) is the real boundary; the frontend "Master Control Access" lock is a session-scoped UX guard only, not a permission check.
Schema only exists as 9 sequential migration scripts — no single schema file, and they must be applied in order.
The two core workflows (sales→outbound stock deduction, purchasing→GRN→inbound stock increment) span 3-4 files each and aren't obvious without tracing the grn_id/grn_remark/outbound_confirmed state machine across tables.
Stock mutations match products by name, not ID — a sharp edge if duplicate names ever exist.
Heavy duplication (customers.js/suppliers.js near-identical; formatting helpers copy-pasted across 6+ files) flagged so a future refactor doesn't miss instances.


Features to be implemented in the future:
Returns Feature for both supplier orders and customer orders.
Reports - Monthly Sales Report, Product wise sales, Purchase Reports, Payment Reports, Stock Level Reports.

User Activity Log (Audit Trail) — IMPLEMENTED. See "Reports / User Activity Log (audit trail)" under Core business workflows above, `migration-audit-log.sql`, and the `audit_logs` entry under Data model. The spec below is kept as the reference design doc; scope decisions where the implementation diverges from it (failed-login logging, in-app user-management events, hardcoded UI filter lists vs. free-text schema) are called out there.

Feature: User Activity Log (Audit Trail)

Objective

Implement a centralized audit logging system that records all significant user actions performed within the ERP system. The log shall provide a complete historical record of system activities for accountability, security, troubleshooting, and compliance purposes.

Functional Requirements

1. Automatic Logging

The system shall automatically record user activities without requiring any user interaction.

Every log entry shall be created immediately after a successful operation.

Failed operations may optionally be logged separately for security monitoring.

2. Logged information

Log ID
Unique identifier

Timestamp
Date & time of action

User ID
Internal user ID

User Name
Display name

User Role
Admin / Manager / CEO / Tech Lead

Module
Products, Customers, Supplier Orders, etc.

Action
Create, Update, Delete, Login, Logout, Approve, Reject, Export, etc.

Record Type
Product, Supplier Order, Customer, User, Invoice

Record ID
Database record ID

Description
Human-readable summary

Previous Value
JSON snapshot before change (if applicable)

New Value
JSON snapshot after change (if applicable)

3. Actions That Must Be Logged

Authentication

* User Login
* User Logout
* Password Reset
* Invite Accepted
* Failed Login Attempt (optional)

User Management

* User Created
* User Updated
* User Deleted
* Role Changed
* Permissions Modified

Products

* Product Created
* Product Updated
* Product Deleted
* Stock Quantity Updated
* Unit Price Changed
* Unit Cost Changed

Suppliers

* Supplier Added
* Supplier Updated
* Supplier Deleted

Customers

* Customer Added
* Customer Updated
* Customer Deleted

Supplier Orders

* Supplier Order Created
* Supplier Order Updated
* Supplier Order Deleted

GRN

* GRN Generated
* GRN Saved
* GRN Confirmed
* GRN Rejected

Inbound

* Stock Received
* Stock Adjusted

Customer Orders

* Customer Order Created
* Customer Order Updated
* Customer Order Deleted
* Payment Status Changed

Outbound

* Dispatch Confirmed
* Dispatch Rejected
* Stock Deducted

Inventory

* Manual Stock Adjustment
* Bulk Stock Update

System

* Settings Changed
* Configuration Updated
* Export Generated
* PDF Generated (optional)

Log Description Examples

Instead of only storing technical data, every log should contain a readable description.

John Smith created Product "Paracetamol 500mg".

Mary confirmed GRN #1025.

David updated stock quantity of Product "Insulin" from 120 to 165.

Admin changed Unit Price of Product "Syringe" from RM2.50 to RM2.80.

Sarah deleted Supplier "ABC Pharma".

Kevin confirmed dispatch for Customer Order CO-000512.


Change Tracking

For UPDATE operations the system shall store:

{
  "unit_price": 12.50,
  "stock": 100
}

{
  "unit_price": 13.00,
  "stock": 100
}

Search & Filtering

Users with appropriate permissions shall be able to filter logs by:

* Date range
* User
* Role
* Module
* Action
* Record type
* Record ID
* Keywords
* Success / Failed
* Category

Sorting

Support sorting by:

* Newest first
* Oldest first
* User
* Module
* Action

Export

Authorized users shall be able to export filtered logs to:

* Excel

Permissions - Only power users will only be able to access and view logs.
Even power users cannot delete any logs, onced loged in the audit, it will be stored indefinitly.


Logging shall add minimal latency (target <50 ms per operation).
Logging failures should not block the primary business operation; they should be captured and monitored separately.

A good audit log should be extensible, so future modules like Returns, Purchase Returns, or Stock Adjustments can reuse the same logging framework without requiring structural changes.

Avoid hardcoding actions for the current modules, define generic fields such as:

* Module
* Action
* Record Type
* Record ID
* Description
* Old Data
* New Data
* Timestamp
* User

Prioritize implementing the logging system as a cross-cutting service used by every module. Think of it as infrastructure rather than a feature tied to Products or Orders so that it will accomodate future features implemented.