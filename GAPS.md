# Identified Gaps & Improvement Areas

A structured breakdown of every gap, inconsistency, and missing feature found during the initial codebase review.

---

## 1. Data Persistence — Supplier Orders Lost on Reload

**Where:** `supplier-orders.js` — `state.orders[]`

**Problem:** The Order Register is held entirely in JavaScript memory (`state.orders`). Every page reload wipes all entered supplier orders. There is no `localStorage` save/restore for orders.

**Impact:** High — any accidental reload mid-session destroys all work done in that session.

**Fix direction:** Serialize `state.orders` to `localStorage` on every write and rehydrate on page load. The invoice module already does this for the sequence counter, so the pattern is established.

---

## 2. "Generate PO" Not Implemented

**Where:** `supplier-orders.html` line 175–180, `supplier-orders.js`

**Problem:** The **Generate PO** button is rendered in the batch action bar and is permanently `disabled`. No click handler, no PDF generation logic, no template exists for it.

**Impact:** Medium — the button creates a false expectation that Purchase Order generation is available.

**Fix direction:** Either implement PO PDF generation (similar approach to GRN — design a template or generate programmatically with pdf-lib), or remove the button from the UI until it is ready.

---

## 3. Duplicate Utility Functions Across Modules

**Where:** `app.js` and `supplier-orders.js`

**Problem:** The following functions are defined independently in both files with identical (or near-identical) implementations:

| Function | app.js | supplier-orders.js |
|----------|--------|--------------------|
| `pad(value)` | ✓ | ✓ |
| `toInputDate(date)` | ✓ | ✓ |
| `formatAmount(amount)` | ✓ | ✓ |
| `formatQuantity(quantity)` | ✓ | ✓ |
| `parseQuantity(value)` | ✓ | ✓ |
| `escapeHtml(value)` | ✓ | ✓ |
| `bytesFromDataUrl(dataUrl)` | ✓ | ✓ |
| `setButtonBusy(btn, ...)` | ✓ | ✓ |
| `truncateTextToWidth(...)` | ✓ | ✓ |
| `sanitizeFilename(value)` | ✓ | ✓ |

**Impact:** Low (functional) but Medium (maintenance) — any bug fix or change must be applied in two places.

**Fix direction:** Extract shared utilities into a `utils.js` file loaded before both modules.

---

## 4. Many Suppliers Have Zero Products Mapped

**Where:** `supplier-data.js` — `suppliers` array vs `products` array

**Problem:** 14 of the 22 listed suppliers have no products in the `products` array:

- Akenya Distribution
- DIPLO AXIOM
- Derma Nest
- FIXDERMA SL
- IFI International Private Limited
- Jayamaha Distributors
- MW Life Science
- Miumi Naturals
- Pharma Health Lanka
- Rine Pharmaceuticals
- Thrive Healthcare
- Titan Pharmaceuticals (Pvt) Ltd
- Vitamin Galore (Pvt) Ltd
- Viyon Lanka (Pvt) Ltd

When selected, these suppliers show the message *"This supplier is in the supplier list, but no priced products are mapped for it in the workbook yet."* and the Add Product button is disabled.

**Impact:** Medium — users selecting these suppliers hit a dead end with no actionable path.

**Fix direction:** Either populate the missing products or remove unmapped suppliers from the dropdown until their data is available.

---

## 5. Products with Missing Unit Costs

**Where:** `supplier-data.js` — `missingUnitCosts` array

**Problem:** 5 products are known to have no unit cost and are explicitly excluded from the supplier product dropdowns:

| Supplier | Product |
|----------|---------|
| Cosmed International | Heliocare Pure Radiance 60 Capsules |
| Cosmed International | Neoretin Serum Booster Fluid |
| Mediland Healthcare pvt Ltd | Dry Zap |
| Mediland Healthcare pvt Ltd | Fungi-T Zap |
| Mediland Healthcare pvt Ltd | Acne Zap |

**Impact:** Low (handled gracefully) but a real data gap — these products cannot be ordered through the tool.

**Fix direction:** Obtain and enter the unit costs into `supplier-data.js`.

---

## 6. Product Name Mismatches Between Modules

**Where:** `products.js` (Invoice Generator) vs `supplier-data.js` (Supplier Orders)

**Problem:** Several products exist in both data files but under different names, meaning there is no shared identifier linking the same physical product across the two modules:

| In `products.js` | In `supplier-data.js` |
|------------------|-----------------------|
| Salex | Salex Face Wash |
| Cell life Shn | Cell Life SHN |
| Solcare Suncream | Solcare Sun Cream |
| Citrio Shampoo 100ml | Citrio 1 Shampoo 100ml |
| Biotopix Lips | Biotopix Lip Balm |
| Aknix | Aknix Gentle Cleansing Gel |

**Impact:** Low currently (the two modules are independent), but will matter if any cross-module feature is added (e.g. margin calculation, stock tracking).

**Fix direction:** Standardise product names across both files, or introduce a shared product ID field.

---

## 7. Validation Feedback Uses Only `window.alert()`

**Where:** `app.js` — `downloadInvoicePdf()` and `supplier-orders.js` — `saveSupplierOrder()`, `generateSelectedGrnPdf()`

**Problem:** All validation errors are surfaced via browser `alert()` dialogs, which are jarring, block the thread, and cannot be styled.

**Occurrences:**
- "Add at least one product before downloading the invoice PDF."
- "The PDF generator could not be loaded."
- "The PDF could not be generated. Please try again."
- "Choose a supplier before adding the order."
- "Add at least one valid product and quantity before saving the supplier order."
- "Select at least one supplier order to generate the GRN."
- "The GRN template is not available."
- "The GRN could not be generated. Please try again."

**Impact:** Medium — poor UX, especially on mobile.

**Fix direction:** Replace with inline toast notifications or a status banner component already consistent with the existing design system.

---

## 8. Large Base64 Blobs Loaded on Every Page

**Where:** `grn-template-data.js` (~135 KB), `logo-data.js` (~44 KB)

**Problem:** Both files are loaded via `<script>` tags and parsed on page load even when they are not needed. `logo-data.js` is only needed during PDF generation; `grn-template-data.js` is only needed on the Supplier Orders page.

**Impact:** Low–Medium — adds unnecessary parse time to pages that don't use these assets. `logo-data.js` is linked in `invoice-generator.html` only, and `grn-template-data.js` in `supplier-orders.html` only, so the cross-page load is already avoided — but within their respective pages, both are parsed eagerly even before the user requests a PDF.

**Fix direction:** Lazy-load these data URLs only at the moment PDF generation is triggered (fetch from a `.js` file dynamically, or move the data into a `.txt`/`.b64` file fetched on demand).

---

## 9. No Mobile Experience for PDF Preview Panel

**Where:** `styles.css`, `invoice-generator.html`

**Problem:** At ≤ 1180px the layout collapses to a single column with the preview panel stacked above the composer. The invoice preview sheet (`invoice-sheet`) is a wide A4-proportioned element that overflows on small screens even though the composer panel is responsive.

**Impact:** Low (likely desktop-only tool) but the invoice preview becomes unusable on mobile.

**Fix direction:** Add a horizontal scroll wrapper or a collapsed/hidden toggle for the preview on small screens. The PDF download path is unaffected.

---

## 10. Invoice Sequence Counter Edge Case

**Where:** `app.js` — `createInvoiceNumber()`

**Problem:** The sequence counter in `localStorage` is keyed to a date stamp. If the user generates invoice `MED/260509-003` and then manually changes the invoice date to a past date, the next auto-generated number will restart at `001` for that past date — potentially creating a duplicate number if the old date was already used in a previous session.

**Impact:** Low — requires deliberate user action to trigger, but could cause invoice number collisions in the register.

**Fix direction:** Use a global monotonic counter rather than a per-date counter, or validate that the generated number does not match any previously issued number.

---

## Summary Table

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | Supplier orders lost on reload | High | Low |
| 2 | Generate PO not implemented | Medium | High |
| 3 | Duplicate utility functions | Medium | Low |
| 4 | 14 suppliers have no products | Medium | Medium |
| 5 | 5 products missing unit costs | Low | Low (data entry) |
| 6 | Product name mismatches | Low | Low |
| 7 | `window.alert()` for all errors | Medium | Medium |
| 8 | Eager loading of large base64 blobs | Low–Medium | Low |
| 9 | No mobile experience for preview | Low | Medium |
| 10 | Invoice sequence counter edge case | Low | Low |
