const products = [...(window.MEDIVEX_PRODUCTS || [])].sort((left, right) =>
  left.name.localeCompare(right.name),
);

const productLookup = new Map(products.map((product) => [product.name, product]));

const refs = {
  downloadPdf: document.getElementById("download-pdf"),
  invoiceNumber: document.getElementById("invoice-number"),
  invoiceDate: document.getElementById("invoice-date"),
  dueDate: document.getElementById("due-date"),
  billedTo: document.getElementById("billed-to"),
  customerSelect: document.getElementById("customer-select"),
  lineItems: document.getElementById("line-items"),
  addItem: document.getElementById("add-item"),
  resetForm: document.getElementById("reset-form"),
  summaryLines: document.getElementById("summary-lines"),
  summaryQuantity: document.getElementById("summary-quantity"),
  summaryTotal: document.getElementById("summary-total"),
  previewInvoiceNumber: document.getElementById("preview-invoice-number"),
  previewBilledTo: document.getElementById("preview-billed-to"),
  previewInvoiceDate: document.getElementById("preview-invoice-date"),
  previewDueDate: document.getElementById("preview-due-date"),
  previewLineItems: document.getElementById("preview-line-items"),
  previewSubtotal: document.getElementById("preview-subtotal"),
  previewTotal: document.getElementById("preview-total"),
};

let nextLineItemId = 1;

const state = {
  lineItems: [],
};

function createLineItem(partial = {}) {
  return {
    id: nextLineItemId++,
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

function parseInputDate(dateString) {
  if (!dateString) {
    return null;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatInvoiceDate(dateString) {
  const date = parseInputDate(dateString);

  if (!date) {
    return "--/--/----";
  }

  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function formatAmount(amount) {
  return Number(amount || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(quantity) {
  return Number(quantity || 0).toLocaleString("en-LK", {
    maximumFractionDigits: 0,
  });
}

function addDays(date, daysToAdd) {
  const shiftedDate = new Date(date);
  shiftedDate.setDate(shiftedDate.getDate() + daysToAdd);
  return shiftedDate;
}

function calculateDueDate(invoiceDateValue) {
  const invoiceDate = parseInputDate(invoiceDateValue);

  if (!invoiceDate) {
    return "";
  }

  return toInputDate(addDays(invoiceDate, 45));
}

function getProduct(productName) {
  return productLookup.get(productName) || null;
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

function parseFocQuantity(focValue) {
  const normalized = String(focValue ?? "").replace(/[^\d]/g, "");

  if (!normalized) {
    return 0;
  }

  const foc = Number.parseInt(normalized, 10);

  if (!Number.isFinite(foc) || foc < 0) {
    return 0;
  }

  return foc;
}

function getLineAmount(lineItem) {
  const product = getProduct(lineItem.productName);
  const quantity = parseQuantity(lineItem.quantity);

  if (!product || quantity === null) {
    return 0;
  }

  return product.unitPrice * quantity;
}

function getSelectedLineItems() {
  return state.lineItems
    .map((lineItem) => {
      const product = getProduct(lineItem.productName);
      const quantity = parseQuantity(lineItem.quantity);

      if (!product || quantity === null) {
        return null;
      }

      return {
        ...lineItem,
        product,
        quantity,
        foc: parseFocQuantity(lineItem.foc),
        amount: product.unitPrice * quantity,
      };
    })
    .filter(Boolean);
}

function getInvoiceData() {
  const lineItems = getSelectedLineItems();
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    invoiceNumber: refs.invoiceNumber.value.trim() || "MED/------",
    invoiceDateValue: refs.invoiceDate.value,
    invoiceDateLabel: formatInvoiceDate(refs.invoiceDate.value),
    dueDateValue: refs.dueDate.value,
    dueDateLabel: formatInvoiceDate(refs.dueDate.value),
    billedTo: refs.billedTo.value.trim(),
    billedToLabel: refs.billedTo.value.trim() || "Customer details will appear here.",
    lineItems,
    subtotal,
    total: subtotal,
    totalQuantity,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createInvoiceNumber(dateValue) {
  const stamp = (dateValue || toInputDate(new Date())).replaceAll("-", "");
  const storageKey = "medivex-invoice-sequence";
  let sequence = 1;

  try {
    const existing = JSON.parse(window.localStorage.getItem(storageKey) || "{}");

    if (existing.stamp === stamp && Number.isInteger(existing.sequence)) {
      sequence = existing.sequence + 1;
    }

    window.localStorage.setItem(storageKey, JSON.stringify({ stamp, sequence }));
  } catch (_error) {
    sequence = 1;
  }

  return `MED/${stamp.slice(2)}-${String(sequence).padStart(3, "0")}`;
}

function setButtonBusy(button, isBusy, idleLabel, busyLabel) {
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : idleLabel;
}

function renderLineItems() {
  const optionsMarkup = products
    .map(
      (product) =>
        `<option value="${escapeHtml(product.name)}">${escapeHtml(product.name)} - LKR ${formatAmount(product.unitPrice)}</option>`,
    )
    .join("");

  refs.lineItems.innerHTML = state.lineItems
    .map((lineItem, index) => {
      const product = getProduct(lineItem.productName);
      const amount = getLineAmount(lineItem);

      return `
        <div class="line-item" data-line-item-id="${lineItem.id}">
          <label class="field">
            <span>Product ${index + 1}</span>
            <select data-field="product">
              <option value="">Select a product</option>
              ${optionsMarkup.replace(
                `value="${escapeHtml(lineItem.productName)}"`,
                `value="${escapeHtml(lineItem.productName)}" selected`,
              )}
            </select>
          </label>

          <label class="field">
            <span>Unit Price</span>
            <input type="text" value="${product ? formatAmount(product.unitPrice) : "--"}" readonly />
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
            />
          </label>

          <label class="field">
            <span>Amount</span>
            <input type="text" value="${product ? formatAmount(amount) : "--"}" readonly />
          </label>

          <button
            class="line-item__remove"
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

function updateLineItemDisplays() {
  state.lineItems.forEach((lineItem) => {
    const row = refs.lineItems.querySelector(`[data-line-item-id="${lineItem.id}"]`);

    if (!row) {
      return;
    }

    const product = getProduct(lineItem.productName);
    const displayInputs = row.querySelectorAll('input[readonly]');
    const unitPriceInput = displayInputs[0];
    const amountInput = displayInputs[1];

    unitPriceInput.value = product ? formatAmount(product.unitPrice) : "--";
    amountInput.value = product ? formatAmount(getLineAmount(lineItem)) : "--";
  });
}

function updateSummary() {
  const invoiceData = getInvoiceData();

  refs.summaryLines.textContent = String(invoiceData.lineItems.length);
  refs.summaryQuantity.textContent = formatQuantity(invoiceData.totalQuantity);
  refs.summaryTotal.textContent = formatAmount(invoiceData.total);
}

function renderPreview() {
  const invoiceData = getInvoiceData();

  refs.previewInvoiceNumber.textContent = invoiceData.invoiceNumber;
  refs.previewBilledTo.textContent = invoiceData.billedToLabel;
  refs.previewInvoiceDate.textContent = invoiceData.invoiceDateLabel;
  refs.previewDueDate.textContent = invoiceData.dueDateLabel;
  refs.previewSubtotal.textContent = formatAmount(invoiceData.subtotal);
  refs.previewTotal.textContent = formatAmount(invoiceData.total);

  if (!invoiceData.lineItems.length) {
    refs.previewLineItems.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="5">Choose a product, quantity, and FOC to start building the invoice.</td>
      </tr>
      ${Array.from({ length: 4 }, () => '<tr class="blank-row"><td></td><td></td><td></td><td></td><td></td></tr>').join("")}
    `;
    return;
  }

  const filledRows = invoiceData.lineItems
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.product.name)}</td>
          <td>${formatAmount(item.product.unitPrice)}</td>
          <td>${formatQuantity(item.quantity)}</td>
          <td>${formatQuantity(item.foc)}</td>
          <td>${formatAmount(item.amount)}</td>
        </tr>
      `,
    )
    .join("");

  const blankRowCount = Math.max(0, 5 - invoiceData.lineItems.length);
  const blankRows = Array.from(
    { length: blankRowCount },
    () => '<tr class="blank-row"><td></td><td></td><td></td><td></td><td></td></tr>',
  ).join("");

  refs.previewLineItems.innerHTML = filledRows + blankRows;
}

function syncDates() {
  refs.dueDate.value = calculateDueDate(refs.invoiceDate.value);
}

function syncUi() {
  syncDates();
  updateLineItemDisplays();
  updateSummary();
  renderPreview();
}

async function saveCustomerOrder(invoiceData) {
  try {
    const db = window.MVB_DB;

    // Check stock availability before inserting the order
    const shortfalls = [];
    for (const item of invoiceData.lineItems) {
      const needed = item.quantity + (item.foc || 0);
      if (needed <= 0) continue;
      const fetchRes = await db.from('products').select('id, name, stock_quantity').eq('name', item.product.name);
      if (fetchRes.error || !fetchRes.data || !fetchRes.data.length) continue;
      const available = fetchRes.data[0].stock_quantity || 0;
      if (available < needed) {
        shortfalls.push({ name: item.product.name, available, needed });
      }
    }
    if (shortfalls.length) {
      const lines = shortfalls.map(function (s) {
        return '• ' + s.name + ': need ' + s.needed + ', have ' + s.available;
      });
      window.alert('Insufficient stock for the following items:\n\n' + lines.join('\n') + '\n\nPlease adjust quantities or replenish stock before saving.');
      return;
    }

    const result = await db.from('customer_orders').insert([{
      order_number: invoiceData.invoiceNumber,
      invoice_number: invoiceData.invoiceNumber,
      invoice_date: invoiceData.invoiceDateValue || null,
      due_date: invoiceData.dueDateValue || null,
      billed_to: invoiceData.billedTo,
      total_amount: invoiceData.total,
      item_count: invoiceData.lineItems.length,
      status: 'Unpaid',
    }]).select('id');

    if (result.error || !result.data || !result.data.length) {
      console.error('Failed to save customer order:', result.error);
      return;
    }

    const orderId = result.data[0].id;
    await db.from('customer_order_items').insert(
      invoiceData.lineItems.map((item) => ({
        order_id: orderId,
        product_name: item.product.name,
        unit_price: item.product.unitPrice,
        quantity: item.quantity,
        foc: item.foc,
        amount: item.amount,
      }))
    );

    // Deduct stock for each line item (quantity sold + free-of-charge units both leave the warehouse)
    for (const item of invoiceData.lineItems) {
      const reduceBy = item.quantity + (item.foc || 0);
      if (reduceBy <= 0) continue;
      const fetchRes = await db.from('products').select('id, stock_quantity').eq('name', item.product.name);
      if (!fetchRes.error && fetchRes.data) {
        for (const prod of fetchRes.data) {
          await db.from('products').update({
            stock_quantity: (prod.stock_quantity || 0) - reduceBy,
          }).eq('id', prod.id);
        }
      }
    }
  } catch (err) {
    console.error('Error saving customer order:', err);
  }
}

async function downloadInvoicePdf() {
  syncDates();

  const invoiceData = getInvoiceData();

  if (!invoiceData.lineItems.length) {
    window.alert("Add at least one product before downloading the invoice PDF.");
    return;
  }

  if (!window.PDFLib) {
    window.alert("The PDF generator could not be loaded.");
    return;
  }

  // Stock check — must pass before PDF is generated or order is saved
  const db = window.MVB_DB;
  const shortfalls = [];
  for (const item of invoiceData.lineItems) {
    const needed = item.quantity + (item.foc || 0);
    if (needed <= 0) continue;
    const fetchRes = await db.from('products').select('id, name, stock_quantity').eq('name', item.product.name);
    if (fetchRes.error || !fetchRes.data || !fetchRes.data.length) continue;
    const available = fetchRes.data[0].stock_quantity || 0;
    if (available < needed) {
      shortfalls.push({ name: item.product.name, available, needed });
    }
  }
  if (shortfalls.length) {
    const lines = shortfalls.map((s) => '• ' + s.name + ': need ' + s.needed + ', have ' + s.available);
    window.alert('Insufficient stock for the following items:\n\n' + lines.join('\n') + '\n\nPlease replenish stock before saving.');
    return;
  }

  setButtonBusy(refs.downloadPdf, true, "Download PDF", "Generating PDF...");

  try {
    await window.MEDIVEX_PDF_GENERATOR.download(invoiceData);
    await saveCustomerOrder(invoiceData);
  } catch (error) {
    console.error(error);
    window.alert("The PDF could not be generated. Please try again.");
  } finally {
    setButtonBusy(refs.downloadPdf, false, "Download PDF", "Generating PDF...");
  }
}


async function loadCustomers() {
  if (!refs.customerSelect) return;
  try {
    const result = await window.MVB_DB.from("customers").select("id, contact, client, phone").order("contact");
    if (result.error || !result.data) return;
    result.data.forEach((c) => {
      const label = c.contact ? `${c.client} — ${c.contact}` : c.client;
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = label;
      opt.dataset.client = c.client;
      opt.dataset.contact = c.contact || "";
      opt.dataset.phone = c.phone || "";
      refs.customerSelect.appendChild(opt);
    });
  } catch (_err) {
    // customers table may not exist yet; fail silently
  }
}

function resetForm() {
  const today = toInputDate(new Date());
  refs.invoiceDate.value = today;
  refs.invoiceNumber.value = createInvoiceNumber(today);
  refs.billedTo.value = "";
  if (refs.customerSelect) refs.customerSelect.value = "";
  state.lineItems = [createLineItem()];
  renderLineItems();
  syncUi();
}

refs.addItem.addEventListener("click", () => {
  state.lineItems.push(createLineItem());
  renderLineItems();
  syncUi();
});

refs.downloadPdf.addEventListener("click", () => {
  downloadInvoicePdf();
});

refs.resetForm.addEventListener("click", () => {
  resetForm();
});

refs.invoiceNumber.addEventListener("input", renderPreview);
refs.invoiceDate.addEventListener("input", syncUi);
refs.invoiceDate.addEventListener("change", syncUi);
refs.billedTo.addEventListener("input", renderPreview);

refs.lineItems.addEventListener("change", (event) => {
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
    syncUi();
  }
});

refs.lineItems.addEventListener("input", (event) => {
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
    syncUi();
    return;
  }

  if (event.target.matches('[data-field="foc"]')) {
    const normalizedFoc = String(event.target.value).replace(/[^\d]/g, "");

    lineItem.foc = normalizedFoc.replace(/^0+(?=\d)/, "");
    event.target.value = lineItem.foc;
    syncUi();
  }
});

refs.lineItems.addEventListener("click", (event) => {
  const removeButton = event.target.closest('[data-action="remove"]');

  if (!removeButton) {
    return;
  }

  const row = removeButton.closest("[data-line-item-id]");
  const lineItemId = Number(row.dataset.lineItemId);

  state.lineItems = state.lineItems.filter((lineItem) => lineItem.id !== lineItemId);

  if (!state.lineItems.length) {
    state.lineItems = [createLineItem()];
  }

  renderLineItems();
  syncUi();
});

if (refs.customerSelect) {
  refs.customerSelect.addEventListener("change", () => {
    const opt = refs.customerSelect.options[refs.customerSelect.selectedIndex];
    if (!opt || !opt.value) return;
    const lines = [opt.dataset.client];
    if (opt.dataset.contact) lines.push(opt.dataset.contact);
    if (opt.dataset.phone) lines.push(opt.dataset.phone);
    refs.billedTo.value = lines.join("\n");
    renderPreview();
  });
}

resetForm();
loadCustomers();
