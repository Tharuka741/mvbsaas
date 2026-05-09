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

function sanitizeFilename(value) {
  return value.replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replaceAll(/\s+/g, "_");
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

function splitWrappedText(text, font, fontSize, maxWidth) {
  const paragraphs = String(text || "").split(/\r?\n/);
  const lines = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      lines.push("");
    } else {
      let line = words[0];

      for (let index = 1; index < words.length; index += 1) {
        const candidate = `${line} ${words[index]}`;

        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          line = candidate;
        } else {
          lines.push(line);
          line = words[index];
        }
      }

      lines.push(line);
    }

    if (paragraphIndex < paragraphs.length - 1 && !paragraph.trim()) {
      lines.push("");
    }
  });

  return lines;
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

function bytesFromDataUrl(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

function pdfColor(PDFLibInstance, hex) {
  const normalized = hex.replace("#", "");
  const hexValue =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  return PDFLibInstance.rgb(
    parseInt(hexValue.slice(0, 2), 16) / 255,
    parseInt(hexValue.slice(2, 4), 16) / 255,
    parseInt(hexValue.slice(4, 6), 16) / 255,
  );
}

function paginateLineItems(items, regularCapacity, lastPageCapacity) {
  if (items.length <= lastPageCapacity) {
    return [items];
  }

  let pageCount = 1;

  while (items.length > regularCapacity * (pageCount - 1) + lastPageCapacity) {
    pageCount += 1;
  }

  const pages = [];
  let index = 0;
  let remainingItems = items.length;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const isLastPage = pageIndex === pageCount - 1;

    if (isLastPage) {
      pages.push(items.slice(index));
      break;
    }

    const remainingPagesAfterThis = pageCount - pageIndex - 1;
    const capacityAfterThis =
      regularCapacity * Math.max(0, remainingPagesAfterThis - 1) + lastPageCapacity;
    const minimumForThisPage = Math.max(1, remainingItems - capacityAfterThis);
    const targetForThisPage = Math.ceil(remainingItems / (remainingPagesAfterThis + 1));
    const takeCount = Math.max(
      minimumForThisPage,
      Math.min(regularCapacity, targetForThisPage),
    );

    pages.push(items.slice(index, index + takeCount));
    index += takeCount;
    remainingItems -= takeCount;
  }

  return pages;
}

function drawAlignedText(page, text, font, size, x, y, maxWidth, align, color) {
  const safeText = String(text);
  const textWidth = font.widthOfTextAtSize(safeText, size);
  const drawX =
    align === "right" ? x + maxWidth - textWidth : align === "center" ? x + (maxWidth - textWidth) / 2 : x;

  page.drawText(safeText, { x: drawX, y, size, font, color });
}

function drawPdfFooter(page, fonts, palette) {
  const { width } = page.getSize();
  const footerHeight = 56;
  const footerY = 0;
  const sectionWidth = width / 3;
  const labelSize = 7;
  const valueSize = 10;

  page.drawRectangle({
    x: 0,
    y: footerY,
    width,
    height: footerHeight,
    color: palette.header,
  });

  [
    { label: "Website", value: "www.medivex.lk" },
    { label: "Phone", value: "+94 76 293 4783" },
    { label: "Address", value: "No. 10, Raymond Rd, Nugegoda" },
  ].forEach((item, index) => {
    const sectionX = sectionWidth * index;

    drawAlignedText(
      page,
      item.label.toUpperCase(),
      fonts.bodyBold,
      labelSize,
      sectionX,
      footerY + 37,
      sectionWidth,
      "center",
      palette.whiteMuted,
    );
    drawAlignedText(
      page,
      item.value,
      fonts.bodyBold,
      valueSize,
      sectionX,
      footerY + 18,
      sectionWidth,
      "center",
      palette.white,
    );
  });
}

function drawPdfPageHeader(page, invoiceData, fonts, palette, logoImage, pageIndex, pageCount) {
  const { width, height } = page.getSize();
  const marginX = 26;
  const topBandHeight = 108;
  const infoBoxHeight = 76;
  const infoBoxGap = 12;
  const boxTopY = height - topBandHeight - 18;
  const billedWidth = 322;
  const datesWidth = width - marginX * 2 - billedWidth - infoBoxGap;
  const billedY = boxTopY - infoBoxHeight;
  const datesX = marginX + billedWidth + infoBoxGap;
  const logoSize = 58;
  const billedLines = splitWrappedText(
    invoiceData.billedTo || "Customer details not provided.",
    fonts.bodyBold,
    11,
    billedWidth - 28,
  ).slice(0, 4);

  page.drawRectangle({
    x: 0,
    y: height - topBandHeight,
    width,
    height: topBandHeight,
    color: palette.header,
  });

  page.drawImage(logoImage, {
    x: marginX,
    y: height - 84,
    width: logoSize,
    height: logoSize,
  });

  page.drawText("MEDIVEX BIOTECH", {
    x: marginX + 74,
    y: height - 53,
    size: 25,
    font: fonts.serifBold,
    color: palette.white,
  });
  page.drawText("Advancing health, transforming lives.", {
    x: marginX + 74,
    y: height - 74,
    size: 10,
    font: fonts.body,
    color: palette.whiteMuted,
  });

  page.drawText("CUSTOMER COPY", {
    x: width - 177,
    y: height - 42,
    size: 17,
    font: fonts.serifBold,
    color: palette.gold,
  });

  page.drawRectangle({
    x: width - 230,
    y: height - 86,
    width: 204,
    height: 38,
    color: palette.mint,
  });
  page.drawText("INVOICE", {
    x: width - 218,
    y: height - 62,
    size: 7,
    font: fonts.bodyBold,
    color: palette.text,
  });
  page.drawText(invoiceData.invoiceNumber, {
    x: width - 218,
    y: height - 79,
    size: 14,
    font: fonts.bodyBold,
    color: palette.text,
  });

  if (pageCount > 1) {
    page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
      x: width - 96,
      y: height - 102,
      size: 8,
      font: fonts.body,
      color: palette.whiteMuted,
    });
  }

  page.drawRectangle({
    x: marginX,
    y: billedY,
    width: billedWidth,
    height: infoBoxHeight,
    color: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: datesX,
    y: billedY,
    width: datesWidth,
    height: infoBoxHeight,
    color: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
  });

  page.drawText("BILLED TO", {
    x: marginX + 14,
    y: billedY + infoBoxHeight - 18,
    size: 8,
    font: fonts.bodyBold,
    color: palette.blue,
  });

  billedLines.forEach((line, index) => {
    page.drawText(line, {
      x: marginX + 14,
      y: billedY + infoBoxHeight - 40 - index * 14,
      size: 11,
      font: fonts.bodyBold,
      color: palette.text,
    });
  });

  [
    { label: "Invoice Date", value: invoiceData.invoiceDateLabel, y: billedY + 45 },
    { label: "Due Date", value: invoiceData.dueDateLabel, y: billedY + 20 },
  ].forEach((row) => {
    page.drawText(row.label, {
      x: datesX + 14,
      y: row.y,
      size: 10,
      font: fonts.bodyBold,
      color: palette.text,
    });
    page.drawText(row.value, {
      x: datesX + datesWidth - 92,
      y: row.y,
      size: 10,
      font: fonts.bodyBold,
      color: palette.text,
    });
  });

  return {
    marginX,
    tableTopY: billedY - 16,
    tableWidth: width - marginX * 2,
    rowHeight: 24,
    tableHeaderHeight: 28,
    regularBottomLimit: 84,
    lastBottomLimit: 262,
    columns: [
      { key: "description", label: "Description", width: 221, align: "left" },
      { key: "price", label: "Price (LKR)", width: 94, align: "right" },
      { key: "qty", label: "Qty.", width: 52, align: "center" },
      { key: "foc", label: "FOC", width: 52, align: "center" },
      { key: "amount", label: "Amount (LKR)", width: 124, align: "right" },
    ],
  };
}

function drawPdfTable(page, rows, layout, fonts, palette) {
  const tableBottomY =
    layout.tableTopY - layout.tableHeaderHeight - rows.length * layout.rowHeight;

  page.drawRectangle({
    x: layout.marginX,
    y: layout.tableTopY - layout.tableHeaderHeight,
    width: layout.tableWidth,
    height: layout.tableHeaderHeight,
    color: palette.blue,
  });

  let columnX = layout.marginX;

  layout.columns.forEach((column) => {
    page.drawText(column.label.toUpperCase(), {
      x: columnX + 12,
      y: layout.tableTopY - 19,
      size: 9,
      font: fonts.bodyBold,
      color: palette.white,
    });
    columnX += column.width;
  });

  page.drawRectangle({
    x: layout.marginX,
    y: tableBottomY,
    width: layout.tableWidth,
    height: layout.tableHeaderHeight + rows.length * layout.rowHeight,
    borderColor: palette.borderStrong,
    borderWidth: 1,
  });

  let dividerX = layout.marginX;
  layout.columns.forEach((column, index) => {
    dividerX += column.width;

    if (index < layout.columns.length - 1) {
      page.drawLine({
        start: { x: dividerX, y: tableBottomY },
        end: { x: dividerX, y: layout.tableTopY },
        thickness: 1,
        color: palette.border,
      });
    }
  });

  rows.forEach((item, rowIndex) => {
    const rowTopY = layout.tableTopY - layout.tableHeaderHeight - rowIndex * layout.rowHeight;
    const rowBottomY = rowTopY - layout.rowHeight;
    let cellX = layout.marginX;

    page.drawLine({
      start: { x: layout.marginX, y: rowBottomY },
      end: { x: layout.marginX + layout.tableWidth, y: rowBottomY },
      thickness: 1,
      color: palette.border,
    });

    const productName = truncateTextToWidth(
      item.product.name,
      fonts.body,
      10,
      layout.columns[0].width - 20,
    );

    [
      { text: productName, width: layout.columns[0].width, align: "left", font: fonts.body },
      {
        text: formatAmount(item.product.unitPrice),
        width: layout.columns[1].width,
        align: "right",
        font: fonts.body,
      },
      {
        text: formatQuantity(item.quantity),
        width: layout.columns[2].width,
        align: "center",
        font: fonts.body,
      },
      {
        text: formatQuantity(item.foc),
        width: layout.columns[3].width,
        align: "center",
        font: fonts.body,
      },
      {
        text: formatAmount(item.amount),
        width: layout.columns[4].width,
        align: "right",
        font: fonts.bodyBold,
      },
    ].forEach((cell) => {
      drawAlignedText(
        page,
        cell.text,
        cell.font,
        10,
        cellX + 10,
        rowTopY - 16,
        cell.width - 20,
        cell.align,
        palette.text,
      );
      cellX += cell.width;
    });
  });
}

function drawPdfLastPageExtras(page, invoiceData, fonts, palette, layout) {
  const { width } = page.getSize();
  const summaryWidth = 220;
  const summaryRowHeight = 26;
  const summaryX = width - layout.marginX - summaryWidth;
  const summaryY = 168;
  const signatureY = 116;
  const bankX = 208;
  const bankY = 106;

  page.drawRectangle({
    x: summaryX,
    y: summaryY,
    width: summaryWidth,
    height: summaryRowHeight * 3,
    borderColor: palette.borderStrong,
    borderWidth: 1,
  });

  [
    { label: "Subtotal", value: formatAmount(invoiceData.subtotal), fill: null, font: fonts.bodyBold },
    { label: "VAT", value: "-", fill: null, font: fonts.body },
    { label: "Grand Total", value: formatAmount(invoiceData.total), fill: palette.mintSoft, font: fonts.bodyBold },
  ].forEach((row, index) => {
    const rowY = summaryY + summaryRowHeight * (2 - index);

    if (row.fill) {
      page.drawRectangle({
        x: summaryX,
        y: rowY,
        width: summaryWidth,
        height: summaryRowHeight,
        color: row.fill,
      });
    }

    if (index > 0) {
      page.drawLine({
        start: { x: summaryX, y: rowY + summaryRowHeight },
        end: { x: summaryX + summaryWidth, y: rowY + summaryRowHeight },
        thickness: 1,
        color: palette.border,
      });
    }

    page.drawText(row.label, {
      x: summaryX + 14,
      y: rowY + 8,
      size: 10,
      font: row.font,
      color: palette.text,
    });
    drawAlignedText(
      page,
      row.value,
      row.font,
      10,
      summaryX + 100,
      rowY + 8,
      102,
      "right",
      palette.text,
    );
  });

  [
    { label: "ISSUED BY", x: layout.marginX, width: 154 },
    { label: "RECEIVED BY", x: width - layout.marginX - 154, width: 154 },
  ].forEach((signature) => {
    page.drawLine({
      start: { x: signature.x, y: signatureY },
      end: { x: signature.x + signature.width, y: signatureY },
      thickness: 1.3,
      color: palette.borderStrong,
    });
    drawAlignedText(
      page,
      signature.label,
      fonts.bodyBold,
      10,
      signature.x,
      signatureY - 18,
      signature.width,
      "center",
      palette.text,
    );
  });

  page.drawText("Bank Details", {
    x: bankX,
    y: bankY + 34,
    size: 9,
    font: fonts.bodyBold,
    color: palette.text,
  });

  [
    "A/C No: 0003 1003 3790",
    "Name: Medivex Biotech (Private) Limited",
    "Bank: Sampath Bank",
    "Branch: Nugegoda",
  ].forEach((line, index) => {
    page.drawText(line, {
      x: bankX,
      y: bankY + 20 - index * 12,
      size: 8.5,
      font: fonts.body,
      color: palette.text,
    });
  });

  page.drawText("Credit Period: 45 Days", {
    x: layout.marginX,
    y: 70,
    size: 8.5,
    font: fonts.bodyBold,
    color: palette.text,
  });
  page.drawText("Payment Method: Bank Transfer / Cheque", {
    x: layout.marginX + 144,
    y: 70,
    size: 8.5,
    font: fonts.body,
    color: palette.text,
  });
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

  setButtonBusy(refs.downloadPdf, true, "Download PDF", "Generating PDF...");

  try {
    const { PDFDocument, PageSizes, StandardFonts } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const pageSize = PageSizes.A4;
    const fonts = {
      body: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bodyBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    };
    const palette = {
      header: pdfColor(window.PDFLib, "#1B2149"),
      blue: pdfColor(window.PDFLib, "#154796"),
      text: pdfColor(window.PDFLib, "#132041"),
      border: pdfColor(window.PDFLib, "#D6DFEE"),
      borderStrong: pdfColor(window.PDFLib, "#B5C2D8"),
      card: pdfColor(window.PDFLib, "#F7FAFF"),
      mint: pdfColor(window.PDFLib, "#C6EFC7"),
      mintSoft: pdfColor(window.PDFLib, "#E4F6E2"),
      gold: pdfColor(window.PDFLib, "#F0D07D"),
      white: pdfColor(window.PDFLib, "#FFFFFF"),
      whiteMuted: pdfColor(window.PDFLib, "#DCE4FA"),
    };
    const logoBytes = bytesFromDataUrl(window.MEDIVEX_LOGO_DATA_URL);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const prototypePage = pdfDoc.addPage(pageSize);
    const prototypeLayout = drawPdfPageHeader(
      prototypePage,
      invoiceData,
      fonts,
      palette,
      logoImage,
      0,
      1,
    );
    pdfDoc.removePage(0);

    const regularCapacity = Math.floor(
      (prototypeLayout.tableTopY -
        prototypeLayout.tableHeaderHeight -
        prototypeLayout.regularBottomLimit) /
        prototypeLayout.rowHeight,
    );
    const lastPageCapacity = Math.floor(
      (prototypeLayout.tableTopY -
        prototypeLayout.tableHeaderHeight -
        prototypeLayout.lastBottomLimit) /
        prototypeLayout.rowHeight,
    );
    const paginatedItems = paginateLineItems(
      invoiceData.lineItems,
      regularCapacity,
      lastPageCapacity,
    );

    paginatedItems.forEach((rows, pageIndex) => {
      const page = pdfDoc.addPage(pageSize);
      const layout = drawPdfPageHeader(
        page,
        invoiceData,
        fonts,
        palette,
        logoImage,
        pageIndex,
        paginatedItems.length,
      );

      drawPdfTable(page, rows, layout, fonts, palette);

      if (pageIndex === paginatedItems.length - 1) {
        drawPdfLastPageExtras(page, invoiceData, fonts, palette, layout);
      }

      drawPdfFooter(page, fonts, palette);
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeInvoiceNumber = sanitizeFilename(invoiceData.invoiceNumber || "invoice");

    link.href = downloadUrl;
    link.download = `${safeInvoiceNumber}.pdf`;
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
  } catch (error) {
    console.error(error);
    window.alert("The PDF could not be generated. Please try again.");
  } finally {
    setButtonBusy(refs.downloadPdf, false, "Download PDF", "Generating PDF...");
  }
}

function resetForm() {
  const today = toInputDate(new Date());
  refs.invoiceDate.value = today;
  refs.invoiceNumber.value = createInvoiceNumber(today);
  refs.billedTo.value = "";
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

resetForm();
