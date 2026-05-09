# Medivex Operations Dashboard — Project Notes

## What It Is

A pure static frontend (HTML + CSS + JS) internal operations tool for **Medivex Biotech (Private) Limited**, a pharmaceutical/biotech company based in Nugegoda, Sri Lanka. No backend, no build tools, no npm — files run directly in the browser.

---

## Pages

| Page | File | Purpose |
|------|------|---------|
| Dashboard | `index.html` | Landing page linking to both tools |
| Invoice Generator | `invoice-generator.html` | Create and download customer invoices as PDF |
| Supplier Orders | `supplier-orders.html` | Capture supplier orders and generate GRN PDFs |

---

## File Structure

```
MVB SaaS/
├── index.html                  # Dashboard landing page
├── invoice-generator.html      # Invoice generator page
├── supplier-orders.html        # Supplier orders page
├── app.js                      # Invoice generator logic (1166 lines)
├── supplier-orders.js          # Supplier orders logic (1102 lines)
├── styles.css                  # All styling — shared across pages (1464 lines)
├── products.js                 # 92 customer-facing products with LKR unit prices
├── supplier-data.js            # 22 suppliers, per-supplier products + unit costs
├── grn-template-data.js        # Base64-encoded GRN template PDF (~135 KB)
├── logo-data.js                # Base64-encoded company logo PNG (~44 KB)
└── assets/
    ├── logo.png                # Medivex logo (nav + composer panel)
    ├── logo-icon.png           # Logo icon variant
    ├── logo-icon-invoice.png   # Logo icon used inside invoice preview
    └── vendor/
        └── pdf-lib.min.js      # Vendored PDF generation library
```

---

## Feature 1 — Invoice Generator

### How It Works
1. User fills in Invoice Number, Invoice Date, and Billed To fields
2. User adds line items — each has a product dropdown, quantity, and FOC (Free of Charge) field
3. A live preview panel on the right updates on every keystroke
4. User clicks **Download PDF** to generate and download an A4 invoice

### Key Behaviours
- **Invoice Number** is auto-generated in the format `MED/YYMMDD-NNN`. The sequence counter (`NNN`) is stored in `localStorage` and increments per date stamp, so numbering resets each new day.
- **Due Date** is calculated as invoice date + 45 days and is readonly.
- **FOC** quantity appears on the invoice PDF but does not affect the line amount or totals.
- **VAT is omitted** from customer invoices — the summary shows Subtotal, VAT (displayed as "–"), and Grand Total (same as subtotal).
- **Products** are loaded from `products.js` (92 products) and sorted alphabetically in the dropdown.
- **PDF pagination** is handled automatically — if there are too many line items for one A4 page, additional pages are added. The summary, signatures, and bank details only appear on the last page.

### PDF Contents
- Header: Medivex Biotech brand, "CUSTOMER COPY" badge, Invoice Number chip
- Info grid: Billed To address, Invoice Date, Due Date
- Line items table: Description, Price (LKR), Qty, FOC, Amount (LKR)
- Summary box: Subtotal, VAT (–), Grand Total
- Signoff: Issued By / Received By signature lines
- Bank details: Sampath Bank, A/C No. 0003 1003 3790, Nugegoda branch
- Footer: Website, Phone, Address

---

## Feature 2 — Supplier Orders

### How It Works
1. User selects a supplier from the dropdown
2. Products and unit costs for that supplier auto-populate from `supplier-data.js`
3. User adds line items, sets quantities, and optionally enables VAT at 18%
4. User clicks **Add Supplier Order** — the order is saved to in-memory state and appears in the Order Register on the right
5. Orders in the register can be selected individually or in bulk for:
   - **Delete Selected** — removes from the register
   - **Generate GRN** — creates a GRN PDF for the selected orders

### Key Behaviours
- **VAT** is a per-order toggle at 18%. Each line item shows subtotal, VAT amount, and net amount. The order card shows aggregate subtotal, VAT, and net total.
- **Orders persist only for the current session** — they are lost when the page is reloaded.
- **Supplier aliases** are handled — e.g. the display name "Cosmed International Pvt Ltd" maps to "Cosmed International" in the product catalogue.
- **"Generate PO"** button is present in the UI but is disabled and not yet implemented.

### GRN Generation
- The GRN PDF is created by overlaying text onto a pre-designed template PDF embedded in `grn-template-data.js`
- Each GRN note holds up to **6 line items**; orders with more items are split into multiple notes
- **2 GRN notes** are printed per A4 page (top half and bottom half)
- GRN number format: `GRN-YYMMDD-NNN` (sequential within the batch)
- Fields filled per note: Date, Supplier Name, GRN No., Invoice/Reference No., product rows (name, qty ordered, qty received, unit cost, line total), note subtotal

---

## Data

### `products.js`
- `window.MEDIVEX_PRODUCTS` — array of `{ name, unitPrice }` objects
- 92 products total, currency in LKR
- Used only by the Invoice Generator

### `supplier-data.js`
- `window.MEDIVEX_SUPPLIER_DIRECTORY` — object with:
  - `suppliers` — array of 22 display supplier names
  - `supplierAliases` — maps display names to catalogue names where they differ
  - `products` — array of `{ supplier, product, unitCost }` records
  - `missingUnitCosts` — array of `{ supplier, product }` records where unit cost is unknown
- Used only by the Supplier Orders module

### Embedded Assets
- `grn-template-data.js` — sets `window.MEDIVEX_GRN_TEMPLATE_DATA_URL` (base64 PNG)
- `logo-data.js` — sets `window.MEDIVEX_LOGO_DATA_URL` (base64 PNG), used for the logo inside generated PDFs

---

## Styling

- **Design system**: CSS custom properties defined in `:root`
- **Aesthetic**: Glassmorphism — semi-transparent panels, `backdrop-filter: blur`, layered radial gradients
- **Brand palette**:
  | Token | Hex | Usage |
  |-------|-----|-------|
  | `--ink` | `#132041` | Body text |
  | `--brand` | `#154796` | Primary brand blue |
  | `--brand-strong` | `#0e3778` | Darker brand blue |
  | `--accent` | `#bde9c8` | Mint green accent |
- **Typography**: Avenir Next / Segoe UI for body text; Iowan Old Style / Palatino for display headings
- **Responsive breakpoints**:
  - `≤ 1180px` — nav stacks, two-column layout collapses to single column
  - `≤ 900px` — line item grids collapse to single column, all flex rows stack vertically
- **Print styles** — hides composer panel, shows invoice sheet full-width at A4 size

---

## Company Details (hardcoded in app)

| Field | Value |
|-------|-------|
| Company | Medivex Biotech (Private) Limited |
| Address | No. 10, Raymond Rd, Nugegoda |
| Phone | +94 76 293 4783 |
| Website | www.medivex.lk |
| Bank | Sampath Bank |
| Branch | Nugegoda |
| Account No. | 0003 1003 3790 |
| Credit Period | 45 Days |
| Payment Method | Bank Transfer / Cheque |
| VAT Rate (supplier) | 18% |
