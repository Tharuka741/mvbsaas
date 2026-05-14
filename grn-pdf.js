// Shared GRN PDF generation helpers — loaded before grn.js and inbound.js
(function () {
  var GRN_ROWS_PER_NOTE = 6;
  var GRN_NOTE_VERTICAL_OFFSET = 421;
  var A5_WIDTH  = 595.276;
  var A5_HEIGHT = 420.945;

  function pad(v) { return String(v).padStart(2, '0'); }

  function toInputDate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function formatDisplayDate(dateValue) {
    if (!dateValue) return '--/--/----';
    var parts = String(dateValue).split('T')[0].split('-');
    if (parts.length !== 3) return dateValue;
    return parts[0] + '/' + parts[1] + '/' + parts[2];
  }

  function formatAmount(amount) {
    return Number(amount || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatQuantity(quantity) {
    return Number(quantity || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
  }

  function roundCurrency(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function bytesFromDataUrl(dataUrl) {
    var base64 = String(dataUrl || '').split(',')[1] || '';
    return Uint8Array.from(window.atob(base64), function (c) { return c.charCodeAt(0); });
  }

  function truncateTextToWidth(text, font, fontSize, maxWidth) {
    var normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (font.widthOfTextAtSize(normalized, fontSize) <= maxWidth) return normalized;
    var truncated = normalized;
    while (truncated.length > 1 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth) {
      truncated = truncated.slice(0, -1).trimEnd();
    }
    return truncated + '...';
  }

  function drawTextAtImageCoords(page, text, x, yTop, size, font, maxWidth, align) {
    var safeText = String(text || '');
    if (!safeText) return;
    var pageHeight = page.getSize().height;
    var textWidth = font.widthOfTextAtSize(safeText, size);
    var drawX = align === 'right' ? x - textWidth
      : align === 'center' ? x - textWidth / 2
      : x;
    page.drawText(safeText, {
      x: maxWidth ? Math.max(drawX, x - maxWidth) : drawX,
      y: pageHeight - yTop - size,
      size: size,
      font: font,
    });
  }

  function coverCell(page, left, top, right, bottom, fill) {
    var pageHeight = page.getSize().height;
    var color = fill || window.PDFLib.rgb(1, 1, 1);
    page.drawRectangle({
      x: left + 1,
      y: pageHeight - bottom + 1,
      width: Math.max(0, right - left - 2),
      height: Math.max(0, bottom - top - 2),
      color: color,
    });
  }

  function drawTextInCell(page, text, left, top, right, bottom, size, font, align, padding) {
    var pad2 = padding == null ? 6 : padding;
    var safeText = String(text || '');
    if (!safeText) return;
    var cellWidth = Math.max(0, right - left);
    var truncated = truncateTextToWidth(safeText, font, size, Math.max(0, cellWidth - pad2 * 2));
    var topOffset = top + Math.max(0, (bottom - top - size) / 2) - 0.5;
    if (align === 'right') {
      drawTextAtImageCoords(page, truncated, right - pad2, topOffset, size, font, undefined, 'right');
    } else if (align === 'center') {
      drawTextAtImageCoords(page, truncated, left + cellWidth / 2, topOffset, size, font, undefined, 'center');
    } else {
      drawTextAtImageCoords(page, truncated, left + pad2, topOffset, size, font);
    }
  }

  function chunkArray(items, chunkSize) {
    var chunks = [];
    for (var i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }

  function buildGrnNotes(orders) {
    var notes = [];
    orders.forEach(function (order) {
      var chunks = chunkArray(order.lineItems, GRN_ROWS_PER_NOTE);
      chunks.forEach(function (lineItems) {
        var stampSource = (order.orderDateValue || toInputDate(new Date())).replace(/-/g, '');
        var noteSubtotal = roundCurrency(
          lineItems.reduce(function (sum, item) { return sum + Number(item.subtotal || 0); }, 0)
        );
        notes.push({
          supplierName: order.supplierName,
          dateLabel: order.orderDateValue ? order.orderDateLabel : formatDisplayDate(toInputDate(new Date())),
          invoiceNo: order.reference || '',
          grnNo: 'GRN-' + stampSource.slice(2) + '-' + String(notes.length + 1).padStart(3, '0'),
          lineItems: lineItems,
          noteSubtotal: noteSubtotal,
        });
      });
    });
    return notes;
  }

  function drawGrnNote(page, note, slotIndex, fonts, baseYOffset) {
    var yOffset = (baseYOffset || 0) + slotIndex * GRN_NOTE_VERTICAL_OFFSET;
    var rowCells = [
      [281, 295], [295, 308], [308, 321], [321, 334], [334, 347], [347, 360],
    ].map(function (pair) { return [pair[0] + yOffset, pair[1] + yOffset]; });
    var textSize = 8.4;
    var rowTextSize = 8.2;

    coverCell(page, 116, 217 + yOffset, 334, 230 + yOffset);
    drawTextInCell(page, note.dateLabel,    116, 217 + yOffset, 334, 230 + yOffset, textSize, fonts.bodyBold, 'center', 8);
    drawTextInCell(page, note.supplierName, 116, 230 + yOffset, 449, 243 + yOffset, textSize, fonts.body,     'left',   8);
    drawTextInCell(page, note.grnNo,        383, 204 + yOffset, 449, 217 + yOffset, 7.9,      fonts.bodyBold, 'left',   5);
    drawTextInCell(page, note.invoiceNo,    383, 217 + yOffset, 449, 230 + yOffset, 7.9,      fonts.body,     'left',   5);

    note.lineItems.forEach(function (item, index) {
      var rowTop    = rowCells[index][0];
      var rowBottom = rowCells[index][1];
      drawTextInCell(page, item.productName,              116, rowTop, 271, rowBottom, rowTextSize, fonts.body, 'left',   6);
      drawTextInCell(page, formatQuantity(item.quantity), 271, rowTop, 315, rowBottom, rowTextSize, fonts.body, 'center', 4);
      drawTextInCell(page, formatQuantity(item.quantity), 315, rowTop, 358, rowBottom, rowTextSize, fonts.body, 'center', 4);
      drawTextInCell(page, formatAmount(item.unitCost),   391, rowTop, 441, rowBottom, rowTextSize, fonts.body, 'right',  6);
      drawTextInCell(page, formatAmount(item.subtotal),   441, rowTop, 516, rowBottom, rowTextSize, fonts.body, 'right',  6);
    });

    drawTextInCell(page, formatAmount(note.noteSubtotal), 441, 360 + yOffset, 516, 373 + yOffset, 8.4, fonts.bodyBold, 'right', 6);
  }

  function sanitizeGrnFilename(value) {
    return String(value || 'doc').replace(/[<>:"/\\|?* \-\s]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function normalizeOrder(row) {
    row.supplierName   = row.supplier_name;
    row.orderDateValue = row.order_date || '';
    row.orderDateLabel = formatDisplayDate(row.order_date);
    row.vatEnabled     = row.vat_enabled;
    row.lineItems = (row.supplier_order_items || []).map(function (item) {
      return {
        productName: item.product_name,
        unitCost:    Number(item.unit_cost),
        quantity:    item.quantity,
        subtotal:    Number(item.subtotal),
        vat:         Number(item.vat),
        net:         Number(item.net),
      };
    });
    return row;
  }

  async function buildAllGrnPdfs(selectedOrders) {
    var GRN_TOP_BLANK = 130;
    var templateBytes = bytesFromDataUrl(window.MEDIVEX_GRN_TEMPLATE_DATA_URL);
    var templateDoc   = await window.PDFLib.PDFDocument.load(templateBytes);
    var templatePage  = templateDoc.getPage(0);
    var tpWidth  = templatePage.getSize().width;
    var tpHeight = templatePage.getSize().height;
    var halfH = tpHeight / 2;

    var embeddedH = halfH - GRN_TOP_BLANK;
    var tplYStart = Math.round((A5_HEIGHT - embeddedH) / 2);

    var results = [];
    for (var i = 0; i < selectedOrders.length; i++) {
      var order  = selectedOrders[i];
      var pdfDoc = await window.PDFLib.PDFDocument.create();
      var fonts  = {
        body:     await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica),
        bodyBold: await pdfDoc.embedFont(window.PDFLib.StandardFonts.HelveticaBold),
      };
      var embeddedTpl = await pdfDoc.embedPage(templatePage, {
        left: 0, bottom: halfH, right: tpWidth, top: tpHeight - GRN_TOP_BLANK,
      });
      var notes = buildGrnNotes([order]);
      for (var j = 0; j < notes.length; j++) {
        var page = pdfDoc.addPage([A5_WIDTH, A5_HEIGHT]);
        page.drawPage(embeddedTpl, { x: 0, y: tplYStart });
        drawGrnNote(page, notes[j], 0, fonts, -tplYStart);
      }
      var bytes     = await pdfDoc.save();
      var dateStamp = (order.orderDateValue || toInputDate(new Date())).replace(/-/g, '');
      var refPart   = sanitizeGrnFilename(order.reference || ('order-' + order.id));
      results.push({ filename: 'GRN-' + dateStamp + '-' + refPart + '.pdf', bytes: bytes });
    }
    return results;
  }

  window.GrnPdf = {
    buildAllGrnPdfs:   buildAllGrnPdfs,
    normalizeOrder:    normalizeOrder,
    formatDisplayDate: formatDisplayDate,
    formatAmount:      formatAmount,
    formatQuantity:    formatQuantity,
    roundCurrency:     roundCurrency,
    escapeHtml:        escapeHtml,
    toInputDate:       toInputDate,
    pad:               pad,
    sanitizeGrnFilename: sanitizeGrnFilename,
  };
})();
