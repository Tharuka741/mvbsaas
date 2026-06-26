const VAT_RATE = 0.18;
const db = window.MVB_DB;
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

let supplierMetas = [];
let supplierMetaByDisplayName = new Map();

async function loadSuppliersForForm() {
  try {
    const result = await db.from("suppliers").select("id, name").order("name");
    if (result.error) throw result.error;

    supplierMetas = (result.data || []).map((row) => {
      const displayName = row.name;
      const catalogSupplier = supplierAliases[displayName] || displayName;
      const productCount = (productsBySupplier.get(catalogSupplier) || []).length;
      const missingCount = missingCountsBySupplier.get(catalogSupplier) || 0;
      return { displayName, catalogSupplier, productCount, missingCount };
    });

    supplierMetaByDisplayName = new Map(
      supplierMetas.map((sm) => [sm.displayName, sm]),
    );

    renderSupplierOptions();
    renderSupplierStatus();
  } catch (err) {
    console.error("Failed to load suppliers:", err);
  }
}

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
  selectedOrdersCount: document.getElementById("selected-orders-count"),
  selectAllOrders: document.getElementById("select-all-orders"),
  clearSelectedOrders: document.getElementById("clear-selected-orders"),
  deleteSelectedOrders: document.getElementById("delete-selected-orders"),
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
    foc: partial.foc ?? "0",
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

  const foc = Math.max(0, parseInt(lineItem.foc, 10) || 0);
  const subtotal = roundCurrency(product.unitCost * quantity);
  const vat = roundCurrency(subtotal * (isSupplierVatEnabled() ? VAT_RATE : 0));
  const net = roundCurrency(subtotal + vat);

  return {
    productName: product.product,
    unitCost: product.unitCost,
    quantity,
    foc,
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
  const totalQuantity = lineItems.reduce((sum, lineItem) => sum + lineItem.quantity + lineItem.foc, 0);
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
            <span>FOC</span>
            <input
              data-field="foc"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value="${escapeHtml(lineItem.foc)}"
              placeholder="0"
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

  const selectedCount = getSelectedOrdersCount();

  refs.ordersCount.textContent = String(state.orders.length);
  refs.selectedOrdersCount.textContent = `${selectedCount} order${selectedCount === 1 ? "" : "s"} selected`;
  refs.selectAllOrders.disabled = !state.orders.length;
  refs.clearSelectedOrders.disabled = !selectedCount;
  refs.deleteSelectedOrders.disabled = !selectedCount;

  if (!state.orders.length) {
    refs.supplierOrdersList.innerHTML = `
      <tr><td colspan="7" class="pdash-empty">
        No supplier orders yet. Add one using the form above.
      </td></tr>
    `;
    return;
  }

  refs.supplierOrdersList.innerHTML = state.orders
    .map((order) => {
      const isSelected = state.selectedOrderIds.has(order.id);
      const refLabel = order.reference || `#${order.id}`;
      const itemLineRows = order.lineItems
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.productName)}</td>
              <td style="text-align:right;">${formatAmount(item.unitCost)}</td>
              <td style="text-align:right;">${formatQuantity(item.quantity)}</td>
              <td style="text-align:right;">${formatQuantity(item.foc || 0)}</td>
              <td style="text-align:right;">${formatAmount(item.subtotal)}</td>
              <td style="text-align:right;">${formatAmount(item.vat)}</td>
              <td style="text-align:right;">${formatAmount(item.net)}</td>
            </tr>
          `,
        )
        .join("");

      return `
        <tr class="so-order-row${isSelected ? " so-order-row--selected" : ""}" data-order-id="${order.id}">
          <td>
            <input class="order-card__select" type="checkbox" data-action="toggle-order"${isSelected ? " checked" : ""} aria-label="Select order" />
          </td>
          <td>
            <strong>${escapeHtml(refLabel)}</strong>
            ${order.grnRemark ? `<span class="so-vat-badge so-vat-badge--rejected">${escapeHtml(order.grnRemark)}</span>` : ''}
          </td>
          <td>${escapeHtml(order.supplierName)}</td>
          <td>${escapeHtml(order.orderDateLabel)}</td>
          <td>${order.lineItems.length} line${order.lineItems.length === 1 ? "" : "s"} · ${formatQuantity(order.totalQuantity)} units</td>
          <td style="text-align:right;"><strong>${formatAmount(order.netTotal)}</strong>${order.vatEnabled ? '<span class="so-vat-badge">VAT</span>' : ""}</td>
          <td>
            <div class="so-row-actions">
              <button class="so-expand-btn" type="button" data-action="expand-order" aria-label="Expand details">
                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <button class="order-card__compact-delete" type="button" data-action="delete-order" aria-label="Delete order">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
        <tr class="so-detail-row so-detail-row--hidden" data-detail-for="${order.id}">
          <td colspan="7" class="so-detail-cell">
            <div class="order-card__table-wrap">
              <table class="order-card__table">
                <thead>
                  <tr>
                    <th>Product</th><th>Unit Cost</th><th>Qty.</th><th>FOC</th><th>Subtotal</th><th>VAT</th><th>Net</th>
                  </tr>
                </thead>
                <tbody>${itemLineRows}</tbody>
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
          </td>
        </tr>
      `;
    })
    .join("");
}



async function loadOrders() {
  try {
    const result = await db
      .from("supplier_orders")
      .select("*, supplier_order_items(*), grns(status)")
      .order("created_at", { ascending: false });

    if (result.error) throw result.error;

    state.orders = (result.data || []).map((row) => ({
      id: row.id,
      supplierName: row.supplier_name,
      catalogSupplier: row.catalog_supplier,
      orderDateValue: row.order_date,
      orderDateLabel: formatDisplayDate(row.order_date),
      reference: row.reference || "",
      vatEnabled: row.vat_enabled,
      lineItems: (row.supplier_order_items || []).map((item) => ({
        productName: item.product_name,
        unitCost: Number(item.unit_cost),
        quantity: item.quantity,
        foc: item.foc || 0,
        subtotal: Number(item.subtotal),
        vat: Number(item.vat),
        net: Number(item.net),
      })),
      subtotal: Number(row.subtotal),
      vatTotal: Number(row.vat_total),
      netTotal: Number(row.net_total),
      totalQuantity: row.total_quantity,
      grnId: row.grn_id,
      grnRemark: row.grn_remark || '',
      grnStatus: row.grns ? row.grns.status : null,
      createdAt: row.created_at,
    }));

    renderSupplierOrdersList();
  } catch (err) {
    console.error("Failed to load supplier orders:", err);
    refs.supplierOrdersList.innerHTML = `
      <div class="orders-empty">
        Could not load supplier orders. Please refresh the page.
      </div>
    `;
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

async function saveSupplierOrder() {
  const draft = getSupplierOrderDraft();

  if (!draft.supplierMeta) {
    window.alert("Choose a supplier before adding the order.");
    return;
  }

  if (!draft.lineItems.length) {
    window.alert("Add at least one valid product and quantity before saving the supplier order.");
    return;
  }

  setButtonBusy(refs.saveSupplierOrder, true, "Add Supplier Order", "Saving...");

  try {
    const orderRes = await db.from("supplier_orders").insert([{
      supplier_name: draft.supplierName,
      catalog_supplier: draft.supplierMeta.catalogSupplier,
      order_date: draft.orderDateValue || null,
      reference: draft.reference || null,
      vat_enabled: draft.vatEnabled,
      subtotal: draft.subtotal,
      vat_total: draft.vatTotal,
      net_total: draft.netTotal,
      total_quantity: draft.totalQuantity,
    }]).select("id");

    if (orderRes.error) throw orderRes.error;

    const orderId = orderRes.data[0].id;
    const itemsRes = await db.from("supplier_order_items").insert(
      draft.lineItems.map((item) => ({
        order_id: orderId,
        product_name: item.productName,
        unit_cost: item.unitCost,
        quantity: item.quantity,
        foc: item.foc,
        subtotal: item.subtotal,
        vat: item.vat,
        net: item.net,
      }))
    );

    if (itemsRes.error) throw itemsRes.error;

    resetSupplierOrderForm();
    await loadOrders();
  } catch (err) {
    console.error("Failed to save supplier order:", err);
    window.alert("Could not save the order. Please try again.");
  } finally {
    setButtonBusy(refs.saveSupplierOrder, false, "Add Supplier Order", "Saving...");
  }
}

function selectAllOrders() {
  state.selectedOrderIds = new Set(state.orders.map((order) => order.id));
  renderSupplierOrdersList();
}

function clearSelectedOrders() {
  state.selectedOrderIds.clear();
  renderSupplierOrdersList();
}

async function deleteSelectedOrders() {
  const selectedIds = [...state.selectedOrderIds];

  if (!selectedIds.length) {
    return;
  }

  const confirmed = state.orders.filter(
    (o) => selectedIds.includes(o.id) && o.grnStatus === "confirmed"
  );
  if (confirmed.length) {
    window.alert(
      `${confirmed.length} order${confirmed.length === 1 ? "" : "s"} cannot be deleted because their GRN has already been confirmed. Remove confirmed orders from the selection and try again.`
    );
    return;
  }

  const res = await db.from("supplier_orders").delete().in("id", selectedIds);

  if (res.error) {
    console.error("Failed to delete orders:", res.error);
    window.alert("Could not delete orders. Please try again.");
    return;
  }

  // Remove any pending GRNs that belonged to the deleted orders
  const pendingGrnIds = state.orders
    .filter((o) => selectedIds.includes(o.id) && o.grnId && o.grnStatus === "pending")
    .map((o) => o.grnId);
  if (pendingGrnIds.length) {
    await db.from("grns").delete().in("id", pendingGrnIds);
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

  if (event.target.matches('[data-field="foc"]')) {
    const normalizedFoc = String(event.target.value).replace(/[^\d]/g, "") || "0";

    lineItem.foc = normalizedFoc.replace(/^0+(?=\d)/, "") || "0";
    event.target.value = lineItem.foc;
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

refs.supplierOrdersList.addEventListener("click", async (event) => {
  const expandBtn = event.target.closest('[data-action="expand-order"]');

  if (expandBtn) {
    const row = expandBtn.closest("[data-order-id]");
    const orderId = row ? row.dataset.orderId : null;
    if (!orderId) return;
    const detailRow = refs.supplierOrdersList.querySelector(`[data-detail-for="${orderId}"]`);
    if (detailRow) detailRow.classList.toggle("so-detail-row--hidden");
    expandBtn.classList.toggle("so-expand-btn--open");
    return;
  }

  const toggleInput = event.target.closest('[data-action="toggle-order"]');

  if (toggleInput) {
    const row = toggleInput.closest("[data-order-id]");
    const orderId = row ? Number(row.dataset.orderId) : null;

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

  const row = deleteButton.closest("[data-order-id]");
  const orderId = row ? Number(row.dataset.orderId) : null;

  if (!orderId) return;

  const orderToDelete = state.orders.find((o) => o.id === orderId);
  if (orderToDelete && orderToDelete.grnStatus === "confirmed") {
    window.alert("This order cannot be deleted because its GRN has already been confirmed. Confirmed GRNs are part of the stock record.");
    return;
  }

  const res = await db.from("supplier_orders").delete().eq("id", orderId);

  if (res.error) {
    console.error("Failed to delete order:", res.error);
    window.alert("Could not remove order. Please try again.");
    return;
  }

  // Remove the pending GRN from inbound if one exists for this order
  if (orderToDelete && orderToDelete.grnId && orderToDelete.grnStatus === "pending") {
    await db.from("grns").delete().eq("id", orderToDelete.grnId);
  }

  state.orders = state.orders.filter((order) => order.id !== orderId);
  renderSupplierOrdersList();
});

loadSuppliersForForm();
resetSupplierOrderForm();
loadOrders();
