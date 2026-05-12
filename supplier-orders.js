const VAT_RATE = 0.18;
const GRN_ROWS_PER_NOTE = 6;
const GRN_NOTE_VERTICAL_OFFSET = 421;
const GRN_TOP_BLANK = 130;

const supplierDirectory = window.MEDIVEX_SUPPLIER_DIRECTORY || {
  suppliers: [],
  supplierAliases: {},
  products: [],
  missingUnitCosts: [],
};

const supplierAliases = supplierDirectory.supplierAliases || {};
const productsBySupplier = new Map();
const missingCountsBySupplier = new Map();

supplierDirectory.products.forEach((record) => {
  const catalogSupplier = record.supplier;

  if (!productsBySupplier.has(catalogSupplier)) {
    productsBySupplier.set(catalogSupplier, []);
  }

  productsBySupplier.get(catalogSupplier).push({
    product: record.product,
    unitCost: Number(record.unitCost),
  });
});

productsBySupplier.forEach((products) => {
  products.sort((left, right) => left.product.localeCompare(right.product));
});

(supplierDirectory.missingUnitCosts || []).forEach((record) => {
  missingCountsBySupplier.set(
    record.supplier,
    (missingCountsBySupplier.get(record.supplier) || 0) + 1,
  );
});

const supplierMetas = [...(supplierDirectory.suppliers || [])]
  .map((displayName) => {
    const catalogSupplier = supplierAliases[displayName] || displayName;
    const productCount = (productsBySupplier.get(catalogSupplier) || []).length;
    const missingCount = missingCountsBySupplier.get(catalogSupplier) || 0;

    return {
      displayName,
      catalogSupplier,
      productCount,
      missingCount,
    };
  })
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

const supplierMetaByDisplayName = new Map(
  supplierMetas.map((supplierMeta) => [supplierMeta.displayName, supplierMeta]),
);

const refs = {
  supplierName: document.getElementById("supplier-name"),
  supplierOrderDate: document.getElementById("supplier-order-date"),
  supplierOrderReference: document.getElementById("supplier-order-reference"),
  supplierVatEnabled: document.getElementById("supplier-vat-enabled"),
  supplierStatus: document.getElementById("supplier-status"),
  supplierLineItems: document.getElementById("supplier-line-items"),
  addSupplierLine: document.getElementById("add-supplier-line"),
  saveSupplierOrder: document.getElementById("save-supplier-order"),
  resetSupplierOrder: document.getElementById("reset-supplier-order"),
  supplierSummaryLines: document.getElementById("supplier-summary-lines"),
  supplierSummaryQuantity: document.getElementById("supplier-summary-quantity"),
  supplierSummaryVatLabel: document.getElementById("supplier-summary-vat-label"),
  supplierSummaryVat: document.getElementById("supplier-summary-vat"),
  supplierSummaryNetLabel: document.getElementById("supplier-summary-net-label"),
  supplierSummaryNet: document.getElementById("supplier-summary-net"),
  ordersCount: document.getElementById("orders-count"),
  ordersQuantity: document.getElementById("orders-quantity"),
  ordersNetTotal: document.getElementById("orders-net-total"),
  selectedOrdersCount: document.getElementById("selected-orders-count"),
  selectAllOrders: document.getElementById("select-all-orders"),
  clearSelectedOrders: document.getElementById("clear-selected-orders"),
  deleteSelectedOrders: document.getElementById("delete-selected-orders"),
  generateSelectedGrn: document.getElementById("generate-selected-grn"),
  generateSelectedPo: document.getElementById("generate-selected-po"),
  supplierOrdersList: document.getElementById("supplier-orders-list"),
};

let nextSupplierLineItemId = 1;

const state = {
  lineItems: [],
  orders: [],
  selectedOrderIds: new Set(),
};

function createSupplierLineItem(partial = {}) {
  return {
    id: nextSupplierLineItemId++,
    productName: partial.productName || "",
    quantity: partial.quantity ?? "1",
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toInputDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDisplayDate(dateValue) {
  if (!dateValue) {
    return "--/--/----";
  }

  const [year, month, day] = dateValue.split("-");
  return `${year}/${month}/${day}`;
}

function formatAmount(amount) {
  return Number(amount || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeFilename(value) {
  return String(value || "document")
    .replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replaceAll(/\s+/g, "_");
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatQuantity(quantity) {
  return Number(quantity || 0).toLocaleString("en-LK", {
    maximumFractionDigits: 0,
  });
}

function parseQuantity(quantityValue) {
  const normalized = String(quantityValue ?? "").replace(/[^\d]/g, "");

  if (!normalized) {
    return null;
  }

  const quantity = Number.parseInt(normalized, 10);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return quantity;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bytesFromDataUrl(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

function setButtonBusy(button, isBusy, idleLabel, busyLabel) {
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : idleLabel;
}

function getSelectedSupplierMeta() {
  return supplierMetaByDisplayName.get(refs.supplierName.value) || null;
}

function getCurrentSupplierProducts() {
  const supplierMeta = getSelectedSupplierMeta();

  if (!supplierMeta) {
    return [];
  }

  return productsBySupplier.get(supplierMeta.catalogSupplier) || [];
}

function getCurrentProductLookup() {
  return new Map(getCurrentSupplierProducts().map((product) => [product.product, product]));
}

function isSupplierVatEnabled() {
  return Boolean(refs.supplierVatEnabled.checked);
}

function getSupplierLineDetails(lineItem) {
  const productLookup = getCurrentProductLookup();
  const product = productLookup.get(lineItem.productName);
  const quantity = parseQuantity(lineItem.quantity);

  if (!product || quantity === null) {
    return null;
  }

  const subtotal = roundCurrency(product.unitCost * quantity);
  const vat = roundCurrency(subtotal * (isSupplierVatEnabled() ? VAT_RATE : 0));
  const net = roundCurrency(subtotal + vat);

  return {
    productName: product.product,
    unitCost: product.unitCost,
    quantity,
    subtotal,
    vat,
    net,
  };
}

function getValidSupplierLineItems() {
  return state.lineItems.map(getSupplierLineDetails).filter(Boolean);
}

function getSupplierOrderDraft() {
  const supplierMeta = getSelectedSupplierMeta();
  const lineItems = getValidSupplierLineItems();
  const subtotal = roundCurrency(lineItems.reduce((sum, lineItem) => sum + lineItem.subtotal, 0));
  const vatTotal = roundCurrency(lineItems.reduce((sum, lineItem) => sum + lineItem.vat, 0));
  const netTotal = roundCurrency(lineItems.reduce((sum, lineItem) => sum + lineItem.net, 0));
  const totalQuantity = lineItems.reduce((sum, lineItem) => sum + lineItem.quantity, 0);
  const vatEnabled = isSupplierVatEnabled();

  return {
    supplierMeta,
    supplierName: supplierMeta ? supplierMeta.displayName : "",
    orderDateValue: refs.supplierOrderDate.value,
    orderDateLabel: formatDisplayDate(refs.supplierOrderDate.value),
    reference: refs.supplierOrderReference.value.trim(),
    vatEnabled,
    lineItems,
    subtotal,
    vatTotal,
    netTotal,
    totalQuantity,
  };
}

function getSelectedOrders() {
  return state.orders.filter((order) => state.selectedOrderIds.has(order.id));
}

function getSelectedOrdersCount() {
  return state.selectedOrderIds.size;
}

function syncSelectionState() {
  const validIds = new Set(state.orders.map((order) => order.id));

  state.selectedOrderIds.forEach((orderId) => {
    if (!validIds.has(orderId)) {
      state.selectedOrderIds.delete(orderId);
    }
  });
}

function renderSupplierOptions() {
  const currentValue = refs.supplierName.value;

  refs.supplierName.innerHTML = [
    '<option value="">Select a supplier</option>',
    ...supplierMetas.map(
      (supplierMeta) =>
        `<option value="${escapeHtml(supplierMeta.displayName)}"${
          supplierMeta.displayName === currentValue ? " selected" : ""
        }>${escapeHtml(supplierMeta.displayName)}</option>`,
    ),
  ].join("");
}

function renderSupplierStatus() {
  const supplierMeta = getSelectedSupplierMeta();

  if (!supplierMeta) {
    refs.supplierStatus.textContent =
      "Choose a supplier to load the available products and unit costs.";
    return;
  }

  if (!supplierMeta.productCount) {
    refs.supplierStatus.textContent =
      "This supplier is in the supplier list, but no priced products are mapped for it in the workbook yet.";
    return;
  }

  if (supplierMeta.missingCount) {
    refs.supplierStatus.textContent = `${supplierMeta.productCount} priced products are available for this supplier. ${supplierMeta.missingCount} product${
      supplierMeta.missingCount === 1 ? " is" : "s are"
    } omitted because unit cost is missing in the workbook.`;
    return;
  }

  refs.supplierStatus.textContent = `${supplierMeta.productCount} priced products are available for this supplier from the workbook.`;
}

function renderSupplierLineItems() {
  const availableProducts = getCurrentSupplierProducts();
  const vatLabel = isSupplierVatEnabled() ? "VAT 18%" : "VAT 0%";
  const netLabel = isSupplierVatEnabled() ? "Net Amount Incl VAT" : "Net Amount";

  refs.supplierLineItems.innerHTML = state.lineItems
    .map((lineItem, index) => {
      const lineDetails = getSupplierLineDetails(lineItem);
      const productOptions = [
        `<option value="">${
          availableProducts.length ? "Select a product" : "Choose a supplier first"
        }</option>`,
        ...availableProducts.map(
          (product) =>
            `<option value="${escapeHtml(product.product)}"${
              product.product === lineItem.productName ? " selected" : ""
            }>${escapeHtml(product.product)} - LKR ${formatAmount(product.unitCost)}</option>`,
        ),
      ].join("");

      return `
        <div class="order-line-item" data-line-item-id="${lineItem.id}">
          <label class="field">
            <span>Product ${index + 1}</span>
            <select data-field="product" ${availableProducts.length ? "" : "disabled"}>
              ${productOptions}
            </select>
          </label>

          <label class="field">
            <span>Unit Cost</span>
            <input
              type="text"
              value="${lineDetails ? formatAmount(lineDetails.unitCost) : "--"}"
              readonly
            />
          </label>

          <label class="field">
            <span>Qty.</span>
            <input
              data-field="quantity"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value="${escapeHtml(lineItem.quantity)}"
            />
          </label>

          <label class="field">
            <span>Total</span>
            <input
              type="text"
              value="${lineDetails ? formatAmount(lineDetails.subtotal) : "--"}"
              readonly
            />
          </label>

          <label class="field">
            <span>${vatLabel}</span>
            <input
              type="text"
              value="${lineDetails ? formatAmount(lineDetails.vat) : "--"}"
              readonly
            />
          </label>

          <label class="field">
            <span>${netLabel}</span>
            <input
              type="text"
              value="${lineDetails ? formatAmount(lineDetails.net) : "--"}"
              readonly
            />
          </label>

          <button
            class="order-line-item__remove"
            type="button"
            data-action="remove"
            title="Remove product"
            ${state.lineItems.length === 1 ? "disabled" : ""}
          >
            ×
          </button>
        </div>
      `;
    })
    .join("");
}

function updateSupplierSummary() {
  const draft = getSupplierOrderDraft();

  refs.supplierSummaryLines.textContent = String(draft.lineItems.length);
  refs.supplierSummaryQuantity.textContent = formatQuantity(draft.totalQuantity);
  refs.supplierSummaryVatLabel.textContent = draft.vatEnabled ? "VAT 18% (LKR)" : "VAT 0% (LKR)";
  refs.supplierSummaryNetLabel.textContent = draft.vatEnabled
    ? "Net Total Incl VAT"
    : "Net Total";
  refs.supplierSummaryVat.textContent = formatAmount(draft.vatTotal);
  refs.supplierSummaryNet.textContent = formatAmount(draft.netTotal);
}

function renderSupplierOrdersList() {
  syncSelectionState();

  const totalQuantity = state.orders.reduce((sum, order) => sum + Number(order.totalQuantity || 0), 0);
  const aggregateNetTotal = state.orders.reduce(
    (sum, order) => sum + Number(order.netTotal || 0),
    0,
  );
  const selectedCount = getSelectedOrdersCount();

  refs.ordersCount.textContent = String(state.orders.length);
  refs.ordersQuantity.textContent = formatQuantity(totalQuantity);
  refs.ordersNetTotal.textContent = formatAmount(aggregateNetTotal);
  refs.selectedOrdersCount.textContent = `${selectedCount} order${
    selectedCount === 1 ? "" : "s"
  } selected`;
  refs.selectAllOrders.disabled = !state.orders.length;
  refs.clearSelectedOrders.disabled = !selectedCount;
  refs.deleteSelectedOrders.disabled = !selectedCount;
  refs.generateSelectedGrn.disabled = !selectedCount;

  if (!state.orders.length) {
    refs.supplierOrdersList.innerHTML = `
      <div class="orders-empty">
        Supplier orders will appear here once you add them from the form on the left.
      </div>
    `;
    return;
  }

  refs.supplierOrdersList.innerHTML = state.orders
    .map(
      (order) => `
        <article class="order-card${
          state.selectedOrderIds.has(order.id) ? " order-card--selected" : ""
        }" data-order-id="${escapeHtml(order.id)}">
          <div class="order-card__header">
            <div class="order-card__head-main">
              <input
                class="order-card__select"
                type="checkbox"
                data-action="toggle-order"
                ${
                  state.selectedOrderIds.has(order.id)
                    ? "checked"
                    : ""
                }
                aria-label="Select supplier order"
              />
              <div>
                <p class="section-kicker">Supplier Order</p>
                <h3>${escapeHtml(order.supplierName)}</h3>
                <div class="order-card__meta">
                  <span class="order-badge">Date: ${escapeHtml(order.orderDateLabel)}</span>
                  ${
                    order.reference
                      ? `<span class="order-badge">Ref: ${escapeHtml(order.reference)}</span>`
                      : ""
                  }
                  <span class="order-badge">VAT: ${order.vatEnabled ? "On" : "Off"}</span>
                  <span class="order-badge">${formatQuantity(order.totalQuantity)} units</span>
                </div>
              </div>
            </div>
            <button
              class="button button--ghost order-card__remove"
              type="button"
              data-action="delete-order"
            >
              Remove Order
            </button>
          </div>

          <div class="order-card__table-wrap">
            <table class="order-card__table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit Cost</th>
                  <th>Qty.</th>
                  <th>Total</th>
                  <th>VAT</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                ${order.lineItems
                  .map(
                    (lineItem) => `
                      <tr>
                        <td>${escapeHtml(lineItem.productName)}</td>
                        <td>${formatAmount(lineItem.unitCost)}</td>
                        <td>${formatQuantity(lineItem.quantity)}</td>
                        <td>${formatAmount(lineItem.subtotal)}</td>
                        <td>${formatAmount(lineItem.vat)}</td>
                        <td>${formatAmount(lineItem.net)}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="order-card__summary">
            <div class="order-card__summary-card">
              <span>Subtotal</span>
              <strong>${formatAmount(order.subtotal)}</strong>
            </div>
            <div class="order-card__summary-card">
              <span>${order.vatEnabled ? "VAT 18%" : "VAT 0%"}</span>
              <strong>${formatAmount(order.vatTotal)}</strong>
            </div>
            <div class="order-card__summary-card">
              <span>Total Qty.</span>
              <strong>${formatQuantity(order.totalQuantity)}</strong>
            </div>
            <div class="order-card__summary-card">
              <span>${order.vatEnabled ? "Net Total Incl VAT" : "Net Total"}</span>
              <strong>${formatAmount(order.netTotal)}</strong>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function truncateTextToWidth(text, font, fontSize, maxWidth) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (font.widthOfTextAtSize(normalized, fontSize) <= maxWidth) {
    return normalized;
  }

  let truncated = normalized;

  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}...`, fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1).trimEnd();
  }

  return `${truncated}...`;
}

function drawTextAtImageCoords(page, text, x, yTop, size, font, maxWidth, align = "left") {
  const safeText = String(text || "");

  if (!safeText) {
    return;
  }

  const { height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(safeText, size);
  const drawX =
    align === "right"
      ? x - textWidth
      : align === "center"
        ? x - textWidth / 2
        : x;

  page.drawText(safeText, {
    x: maxWidth ? Math.max(drawX, x - maxWidth) : drawX,
    y: height - yTop - size,
    size,
    font,
  });
}

function coverCell(page, left, top, right, bottom, fill = window.PDFLib.rgb(1, 1, 1)) {
  const { height } = page.getSize();

  page.drawRectangle({
    x: left + 1,
    y: height - bottom + 1,
    width: Math.max(0, right - left - 2),
    height: Math.max(0, bottom - top - 2),
    color: fill,
  });
}

function drawTextInCell(
  page,
  text,
  left,
  top,
  right,
  bottom,
  size,
  font,
  align = "left",
  padding = 6,
) {
  const safeText = String(text || "");

  if (!safeText) {
    return;
  }

  const cellWidth = Math.max(0, right - left);
  const truncatedText = truncateTextToWidth(
    safeText,
    font,
    size,
    Math.max(0, cellWidth - padding * 2),
  );
  const topOffset = top + Math.max(0, (bottom - top - size) / 2) - 0.5;

  if (align === "right") {
    drawTextAtImageCoords(page, truncatedText, right - padding, topOffset, size, font, undefined, "right");
    return;
  }

  if (align === "center") {
    drawTextAtImageCoords(
      page,
      truncatedText,
      left + cellWidth / 2,
      topOffset,
      size,
      font,
      undefined,
      "center",
    );
    return;
  }

  drawTextAtImageCoords(page, truncatedText, left + padding, topOffset, size, font);
}

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function buildGrnNotes(orders) {
  const notes = [];

  orders.forEach((order, orderIndex) => {
    const chunks = chunkArray(order.lineItems, GRN_ROWS_PER_NOTE);

    chunks.forEach((lineItems, chunkIndex) => {
      const stampSource = (order.orderDateValue || toInputDate(new Date())).replaceAll("-", "");
      const noteSubtotal = roundCurrency(
        lineItems.reduce((sum, lineItem) => sum + Number(lineItem.subtotal || 0), 0),
      );

      notes.push({
        supplierName: order.supplierName,
        dateLabel: order.orderDateValue ? order.orderDateLabel : formatDisplayDate(toInputDate(new Date())),
        invoiceNo: order.reference || "",
        grnNo: `GRN-${stampSource.slice(2)}-${String(notes.length + 1).padStart(3, "0")}`,
        lineItems,
        noteSubtotal,
        orderIndex,
        chunkIndex,
      });
    });
  });

  return notes;
}

function drawGrnNote(page, note, slotIndex, fonts, baseYOffset = 0) {
  const yOffset = baseYOffset + slotIndex * GRN_NOTE_VERTICAL_OFFSET;
  const rowCells = [
    [281, 295],
    [295, 308],
    [308, 321],
    [321, 334],
    [334, 347],
    [347, 360],
  ].map(([top, bottom]) => [top + yOffset, bottom + yOffset]);
  const textSize = 8.4;
  const rowTextSize = 8.2;

  coverCell(page, 116, 217 + yOffset, 334, 230 + yOffset);
  drawTextInCell(
    page,
    note.dateLabel,
    116,
    217 + yOffset,
    334,
    230 + yOffset,
    textSize,
    fonts.bodyBold,
    "center",
    8,
  );
  drawTextInCell(
    page,
    note.supplierName,
    116,
    230 + yOffset,
    449,
    243 + yOffset,
    textSize,
    fonts.body,
    "left",
    8,
  );
  drawTextInCell(
    page,
    note.grnNo,
    383,
    204 + yOffset,
    449,
    217 + yOffset,
    7.9,
    fonts.bodyBold,
    "left",
    5,
  );
  drawTextInCell(
    page,
    note.invoiceNo,
    383,
    217 + yOffset,
    449,
    230 + yOffset,
    7.9,
    fonts.body,
    "left",
    5,
  );

  note.lineItems.forEach((lineItem, index) => {
    const [rowTop, rowBottom] = rowCells[index];

    drawTextInCell(
      page,
      lineItem.productName,
      116,
      rowTop,
      271,
      rowBottom,
      rowTextSize,
      fonts.body,
      "left",
      6,
    );
    drawTextInCell(
      page,
      formatQuantity(lineItem.quantity),
      271,
      rowTop,
      315,
      rowBottom,
      rowTextSize,
      fonts.body,
      "center",
      4,
    );
    drawTextInCell(
      page,
      formatQuantity(lineItem.quantity),
      315,
      rowTop,
      358,
      rowBottom,
      rowTextSize,
      fonts.body,
      "center",
      4,
    );
    drawTextInCell(
      page,
      formatAmount(lineItem.unitCost),
      391,
      rowTop,
      441,
      rowBottom,
      rowTextSize,
      fonts.body,
      "right",
      6,
    );
    drawTextInCell(
      page,
      formatAmount(lineItem.subtotal),
      441,
      rowTop,
      516,
      rowBottom,
      rowTextSize,
      fonts.body,
      "right",
      6,
    );
  });

  drawTextInCell(
    page,
    formatAmount(note.noteSubtotal),
    441,
    360 + yOffset,
    516,
    373 + yOffset,
    8.4,
    fonts.bodyBold,
    "right",
    6,
  );
}

async function generateSelectedGrnPdf() {
  const selectedOrders = getSelectedOrders();

  if (!selectedOrders.length) {
    window.alert("Select at least one supplier order to generate the GRN.");
    return;
  }

  if (!window.PDFLib || !window.MEDIVEX_GRN_TEMPLATE_DATA_URL) {
    window.alert("The GRN template is not available.");
    return;
  }

  setButtonBusy(refs.generateSelectedGrn, true, "Generate GRN", "Generating GRN...");

  try {
    const templateBytes = bytesFromDataUrl(window.MEDIVEX_GRN_TEMPLATE_DATA_URL);
    const templateDoc = await window.PDFLib.PDFDocument.load(templateBytes);
    const grnNotes = buildGrnNotes(selectedOrders);
    const outputDoc = await window.PDFLib.PDFDocument.create();
    const fonts = {
      body: await outputDoc.embedFont(window.PDFLib.StandardFonts.Helvetica),
      bodyBold: await outputDoc.embedFont(window.PDFLib.StandardFonts.HelveticaBold),
    };

    const templatePage = templateDoc.getPage(0);
    const { width: pageWidth, height: pageHeight } = templatePage.getSize();
    const halfHeight = pageHeight / 2;
    const topMargin = Math.round(GRN_TOP_BLANK / 2);
    const embeddedGrn = await outputDoc.embedPage(templatePage, {
      left: 0,
      bottom: halfHeight,
      right: pageWidth,
      top: pageHeight - GRN_TOP_BLANK,
    });

    for (let index = 0; index < grnNotes.length; index += 2) {
      const page = outputDoc.addPage([pageWidth, pageHeight]);
      const topNote = grnNotes[index];
      const bottomNote = grnNotes[index + 1] || null;

      page.drawPage(embeddedGrn, { x: 0, y: halfHeight + topMargin });
      drawGrnNote(page, topNote, 0, fonts, -topMargin);

      if (bottomNote) {
        page.drawPage(embeddedGrn, { x: 0, y: topMargin });
        drawGrnNote(page, bottomNote, 1, fonts, -topMargin);
      }

      page.drawLine({
        start: { x: 0, y: halfHeight },
        end: { x: pageWidth, y: halfHeight },
        thickness: 0.5,
        color: window.PDFLib.rgb(0.5, 0.5, 0.5),
        dashArray: [4, 4],
        dashPhase: 0,
      });
    }

    const pdfBytes = await outputDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileLabel =
      selectedOrders.length === 1
        ? `${selectedOrders[0].supplierName}-grn`
        : `medivex-grn-batch-${selectedOrders.length}`;

    link.href = downloadUrl;
    link.download = `${sanitizeFilename(fileLabel)}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
  } catch (error) {
    console.error(error);
    window.alert("The GRN could not be generated. Please try again.");
  } finally {
    setButtonBusy(refs.generateSelectedGrn, false, "Generate GRN", "Generating GRN...");
  }
}

function syncSupplierUi() {
  renderSupplierStatus();
  renderSupplierLineItems();
  updateSupplierSummary();
  renderSupplierOrdersList();
}

function resetSupplierOrderForm() {
  refs.supplierName.value = "";
  refs.supplierOrderDate.value = toInputDate(new Date());
  refs.supplierOrderReference.value = "";
  refs.supplierVatEnabled.checked = false;
  state.lineItems = [createSupplierLineItem()];
  syncSupplierUi();
}

function saveSupplierOrder() {
  const draft = getSupplierOrderDraft();

  if (!draft.supplierMeta) {
    window.alert("Choose a supplier before adding the order.");
    return;
  }

  if (!draft.lineItems.length) {
    window.alert("Add at least one valid product and quantity before saving the supplier order.");
    return;
  }

  state.orders.unshift({
    id: `SO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    supplierName: draft.supplierName,
    catalogSupplier: draft.supplierMeta.catalogSupplier,
    orderDateValue: draft.orderDateValue,
    orderDateLabel: draft.orderDateLabel,
    reference: draft.reference,
    vatEnabled: draft.vatEnabled,
    lineItems: draft.lineItems,
    subtotal: draft.subtotal,
    vatTotal: draft.vatTotal,
    netTotal: draft.netTotal,
    totalQuantity: draft.totalQuantity,
    createdAt: new Date().toISOString(),
  });

  resetSupplierOrderForm();
  renderSupplierOrdersList();
}

function selectAllOrders() {
  state.selectedOrderIds = new Set(state.orders.map((order) => order.id));
  renderSupplierOrdersList();
}

function clearSelectedOrders() {
  state.selectedOrderIds.clear();
  renderSupplierOrdersList();
}

function deleteSelectedOrders() {
  const selectedCount = getSelectedOrdersCount();

  if (!selectedCount) {
    return;
  }

  state.orders = state.orders.filter((order) => !state.selectedOrderIds.has(order.id));
  state.selectedOrderIds.clear();
  renderSupplierOrdersList();
}

refs.addSupplierLine.addEventListener("click", () => {
  state.lineItems.push(createSupplierLineItem());
  syncSupplierUi();
});

refs.saveSupplierOrder.addEventListener("click", () => {
  saveSupplierOrder();
});

refs.resetSupplierOrder.addEventListener("click", () => {
  resetSupplierOrderForm();
});

refs.selectAllOrders.addEventListener("click", () => {
  selectAllOrders();
});

refs.clearSelectedOrders.addEventListener("click", () => {
  clearSelectedOrders();
});

refs.deleteSelectedOrders.addEventListener("click", () => {
  deleteSelectedOrders();
});

refs.generateSelectedGrn.addEventListener("click", () => {
  generateSelectedGrnPdf();
});

refs.supplierName.addEventListener("change", () => {
  state.lineItems = [createSupplierLineItem()];
  syncSupplierUi();
});

refs.supplierVatEnabled.addEventListener("change", () => {
  syncSupplierUi();
});

refs.supplierLineItems.addEventListener("change", (event) => {
  const row = event.target.closest("[data-line-item-id]");

  if (!row) {
    return;
  }

  const lineItemId = Number(row.dataset.lineItemId);
  const lineItem = state.lineItems.find((item) => item.id === lineItemId);

  if (!lineItem) {
    return;
  }

  if (event.target.matches('[data-field="product"]')) {
    lineItem.productName = event.target.value;
    syncSupplierUi();
  }
});

refs.supplierLineItems.addEventListener("input", (event) => {
  const row = event.target.closest("[data-line-item-id]");

  if (!row) {
    return;
  }

  const lineItemId = Number(row.dataset.lineItemId);
  const lineItem = state.lineItems.find((item) => item.id === lineItemId);

  if (!lineItem) {
    return;
  }

  if (event.target.matches('[data-field="quantity"]')) {
    const normalizedQuantity = String(event.target.value).replace(/[^\d]/g, "");

    lineItem.quantity = normalizedQuantity.replace(/^0+(?=\d)/, "");
    event.target.value = lineItem.quantity;
    syncSupplierUi();
  }
});

refs.supplierLineItems.addEventListener("click", (event) => {
  const removeButton = event.target.closest('[data-action="remove"]');

  if (!removeButton) {
    return;
  }

  const row = removeButton.closest("[data-line-item-id]");
  const lineItemId = Number(row.dataset.lineItemId);

  state.lineItems = state.lineItems.filter((lineItem) => lineItem.id !== lineItemId);

  if (!state.lineItems.length) {
    state.lineItems = [createSupplierLineItem()];
  }

  syncSupplierUi();
});

refs.supplierOrdersList.addEventListener("click", (event) => {
  const toggleInput = event.target.closest('[data-action="toggle-order"]');

  if (toggleInput) {
    const orderCard = toggleInput.closest("[data-order-id]");
    const orderId = orderCard ? orderCard.dataset.orderId : "";

    if (!orderId) {
      return;
    }

    if (toggleInput.checked) {
      state.selectedOrderIds.add(orderId);
    } else {
      state.selectedOrderIds.delete(orderId);
    }

    renderSupplierOrdersList();
    return;
  }

  const deleteButton = event.target.closest('[data-action="delete-order"]');

  if (!deleteButton) {
    return;
  }

  const orderCard = deleteButton.closest("[data-order-id]");
  const orderId = orderCard ? orderCard.dataset.orderId : "";

  state.orders = state.orders.filter((order) => order.id !== orderId);
  renderSupplierOrdersList();
});

renderSupplierOptions();
resetSupplierOrderForm();
renderSupplierOrdersList();
