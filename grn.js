(function () {
  var db = window.MVB_DB;
  var pdfDepsLoaded = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  async function loadPdfDeps() {
    if (pdfDepsLoaded) return;
    await loadScript('assets/vendor/pdf-lib.min.js');
    await loadScript('grn-template-data.js');
    pdfDepsLoaded = true;
  }

  var zipDepLoaded = false;
  async function loadZipDep() {
    if (zipDepLoaded) return;
    await loadScript('https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js');
    zipDepLoaded = true;
  }

  // ── State ─────────────────────────────────────────────────────────
  var pendingOrders = [];
  var selectedOrderIds = new Set();
  var grnList = [];
  var pendingGrnState = null; // holds { selectedOrders, pdfBytes } until confirmed or discarded

  // ── DOM refs ──────────────────────────────────────────────────────
  var pendingList = document.getElementById('grn-pending-list');
  var elPendingCount = document.getElementById('grn-pending-count');
  var elPendingUnits = document.getElementById('grn-pending-units');
  var elPendingTotal = document.getElementById('grn-pending-total');
  var elSelectedCount = document.getElementById('grn-selected-count');
  var btnSelectAll = document.getElementById('grn-select-all');
  var btnClearAll = document.getElementById('grn-clear-all');
  var btnGenerate = document.getElementById('grn-generate-btn');
  var confirmBar = document.getElementById('grn-confirm-bar');
  var btnConfirm = document.getElementById('grn-confirm-btn');
  var btnDiscard = document.getElementById('grn-discard-btn');
  var grnTbody = document.getElementById('grn-register-tbody');
  var elRegCount = document.getElementById('grn-reg-count');

  // ── Helpers ───────────────────────────────────────────────────────
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

  function setButtonBusy(btn, busy, idleLabel, busyLabel) {
    btn.disabled = busy;
    btn.textContent = busy ? busyLabel : idleLabel;
  }

  // ── GRN PDF constants ─────────────────────────────────────────────
  var GRN_ROWS_PER_NOTE = 6;
  var GRN_NOTE_VERTICAL_OFFSET = 421; // unused for A5 single-slot layout, kept for drawGrnNote signature
  var A5_WIDTH  = 595.276;  // A5 landscape = half A4 portrait
  var A5_HEIGHT = 420.945;

  // ── GRN PDF draw functions ────────────────────────────────────────

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
    drawTextInCell(page, note.dateLabel, 116, 217 + yOffset, 334, 230 + yOffset, textSize, fonts.bodyBold, 'center', 8);
    drawTextInCell(page, note.supplierName, 116, 230 + yOffset, 449, 243 + yOffset, textSize, fonts.body, 'left', 8);
    drawTextInCell(page, note.grnNo, 383, 204 + yOffset, 449, 217 + yOffset, 7.9, fonts.bodyBold, 'left', 5);
    drawTextInCell(page, note.invoiceNo, 383, 217 + yOffset, 449, 230 + yOffset, 7.9, fonts.body, 'left', 5);

    note.lineItems.forEach(function (item, index) {
      var rowTop = rowCells[index][0];
      var rowBottom = rowCells[index][1];
      drawTextInCell(page, item.productName, 116, rowTop, 271, rowBottom, rowTextSize, fonts.body, 'left', 6);
      drawTextInCell(page, formatQuantity(item.quantity), 271, rowTop, 315, rowBottom, rowTextSize, fonts.body, 'center', 4);
      drawTextInCell(page, formatQuantity(item.quantity), 315, rowTop, 358, rowBottom, rowTextSize, fonts.body, 'center', 4);
      drawTextInCell(page, formatAmount(item.unitCost), 391, rowTop, 441, rowBottom, rowTextSize, fonts.body, 'right', 6);
      drawTextInCell(page, formatAmount(item.subtotal), 441, rowTop, 516, rowBottom, rowTextSize, fonts.body, 'right', 6);
    });

    drawTextInCell(page, formatAmount(note.noteSubtotal), 441, 360 + yOffset, 516, 373 + yOffset, 8.4, fonts.bodyBold, 'right', 6);
  }

  function sanitizeGrnFilename(value) {
    return String(value || 'doc').replace(/[<>:"/\\|?* -\s]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Returns an array of { filename, bytes } — one entry per selected order.
  async function buildAllGrnPdfs(selectedOrders) {
    var GRN_TOP_BLANK = 130; // blank header area at the top of each GRN form in the template
    var templateBytes = bytesFromDataUrl(window.MEDIVEX_GRN_TEMPLATE_DATA_URL);
    var templateDoc = await window.PDFLib.PDFDocument.load(templateBytes);
    var templatePage = templateDoc.getPage(0);
    var tpWidth  = templatePage.getSize().width;
    var tpHeight = templatePage.getSize().height;
    var halfH = tpHeight / 2;

    // Crop the blank from the top → actual form content height ≈ 290.945pt
    var embeddedH = halfH - GRN_TOP_BLANK;
    // Center the form on the A5 page: equal padding above and below
    var tplYStart = Math.round((A5_HEIGHT - embeddedH) / 2); // ≈ 65pt each side

    var results = [];

    for (var i = 0; i < selectedOrders.length; i++) {
      var order = selectedOrders[i];
      var pdfDoc = await window.PDFLib.PDFDocument.create();
      var fonts = {
        body: await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica),
        bodyBold: await pdfDoc.embedFont(window.PDFLib.StandardFonts.HelveticaBold),
      };

      // Embed top half of template, cropping out the blank header area
      var embeddedTpl = await pdfDoc.embedPage(templatePage, {
        left: 0, bottom: halfH, right: tpWidth, top: tpHeight - GRN_TOP_BLANK,
      });

      var notes = buildGrnNotes([order]);

      for (var j = 0; j < notes.length; j++) {
        var page = pdfDoc.addPage([A5_WIDTH, A5_HEIGHT]);
        // Place form centred: equal blank above and below
        page.drawPage(embeddedTpl, { x: 0, y: tplYStart });
        // baseYOffset = -tplYStart shifts the text down to match the centred form position
        drawGrnNote(page, notes[j], 0, fonts, -tplYStart);
      }

      var bytes = await pdfDoc.save();
      var dateStamp = (order.orderDateValue || toInputDate(new Date())).replace(/-/g, '');
      var refPart = sanitizeGrnFilename(order.reference || ('order-' + order.id));
      results.push({ filename: 'GRN-' + dateStamp + '-' + refPart + '.pdf', bytes: bytes });
    }

    return results;
  }

  // ── Normalize Supabase order rows ─────────────────────────────────

  function normalizeOrder(row) {
    row.supplierName = row.supplier_name;
    row.orderDateValue = row.order_date || '';
    row.orderDateLabel = formatDisplayDate(row.order_date);
    row.vatEnabled = row.vat_enabled;
    row.lineItems = (row.supplier_order_items || []).map(function (item) {
      return {
        productName: item.product_name,
        unitCost: Number(item.unit_cost),
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
        vat: Number(item.vat),
        net: Number(item.net),
      };
    });
    return row;
  }

  // ── Render pending orders ─────────────────────────────────────────

  function renderPendingOrders() {
    var totalUnits = pendingOrders.reduce(function (s, o) { return s + (o.total_quantity || 0); }, 0);
    var totalNet = roundCurrency(pendingOrders.reduce(function (s, o) { return s + Number(o.net_total || 0); }, 0));
    var selCount = selectedOrderIds.size;

    elPendingCount.textContent = String(pendingOrders.length);
    elPendingUnits.textContent = formatQuantity(totalUnits);
    elPendingTotal.textContent = formatAmount(totalNet);
    elSelectedCount.textContent = selCount + ' order' + (selCount === 1 ? '' : 's') + ' selected';
    btnSelectAll.disabled = !pendingOrders.length;
    btnClearAll.disabled = !selCount;
    btnGenerate.disabled = !selCount;

    if (!pendingOrders.length) {
      pendingList.innerHTML =
        '<div class="orders-empty">No pending supplier orders. ' +
        '<a href="supplier-orders.html">Create a supplier order</a> to get started.</div>';
      return;
    }

    pendingList.innerHTML = pendingOrders.map(function (order) {
      var isSelected = selectedOrderIds.has(order.id);
      return (
        '<article class="order-card' + (isSelected ? ' order-card--selected' : '') +
        '" data-order-id="' + order.id + '">' +
        '<div class="order-card__header">' +
        '<div class="order-card__head-main">' +
        '<input class="order-card__select" type="checkbox" data-action="toggle-order"' +
        (isSelected ? ' checked' : '') + ' aria-label="Select order" />' +
        '<div>' +
        '<p class="section-kicker">Supplier Order</p>' +
        '<h3>' + escapeHtml(order.supplier_name) + '</h3>' +
        '<div class="order-card__meta">' +
        '<span class="order-badge">Date: ' + escapeHtml(formatDisplayDate(order.order_date)) + '</span>' +
        (order.reference ? '<span class="order-badge">Ref: ' + escapeHtml(order.reference) + '</span>' : '') +
        '<span class="order-badge">VAT: ' + (order.vat_enabled ? 'On' : 'Off') + '</span>' +
        '<span class="order-badge">' + formatQuantity(order.total_quantity) + ' units</span>' +
        '</div></div></div></div>' +
        '<div class="order-card__table-wrap"><table class="order-card__table">' +
        '<thead><tr><th>Product</th><th>Unit Cost</th><th>Qty.</th><th>Total</th><th>VAT</th><th>Net</th></tr></thead>' +
        '<tbody>' +
        (order.supplier_order_items || []).map(function (item) {
          return (
            '<tr>' +
            '<td>' + escapeHtml(item.product_name) + '</td>' +
            '<td>' + formatAmount(item.unit_cost) + '</td>' +
            '<td>' + formatQuantity(item.quantity) + '</td>' +
            '<td>' + formatAmount(item.subtotal) + '</td>' +
            '<td>' + formatAmount(item.vat) + '</td>' +
            '<td>' + formatAmount(item.net) + '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table></div>' +
        '<div class="order-card__summary">' +
        '<div class="order-card__summary-card"><span>Subtotal</span><strong>' + formatAmount(order.subtotal) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>' + (order.vat_enabled ? 'VAT 18%' : 'VAT 0%') + '</span><strong>' + formatAmount(order.vat_total) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>Total Qty.</span><strong>' + formatQuantity(order.total_quantity) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>' + (order.vat_enabled ? 'Net Total Incl VAT' : 'Net Total') + '</span><strong>' + formatAmount(order.net_total) + '</strong></div>' +
        '</div></article>'
      );
    }).join('');
  }

  // ── Render GRN register ───────────────────────────────────────────

  function renderGrnRegister() {
    elRegCount.textContent = String(grnList.length);

    if (!grnList.length) {
      grnTbody.innerHTML = '<tr><td colspan="6" class="pdash-empty">No confirmed GRNs yet.</td></tr>';
      return;
    }

    grnTbody.innerHTML = grnList.map(function (grn) {
      var ord = (grn.supplier_orders && grn.supplier_orders[0]) || {};
      var grnNo = grn.batch_date ? 'GRN-' + grn.batch_date + '-' + String(grn.id).padStart(3, '0') : 'GRN-' + grn.id;
      var supplier = ord.supplier_name || '—';
      var reference = ord.reference || '—';
      var orderDate = formatDisplayDate(ord.order_date);
      var netTotal = formatAmount(ord.net_total != null ? ord.net_total : grn.net_total);
      return (
        '<tr>' +
        '<td><strong>' + escapeHtml(grnNo) + '</strong></td>' +
        '<td>' + escapeHtml(supplier) + '</td>' +
        '<td>' + escapeHtml(reference) + '</td>' +
        '<td>' + orderDate + '</td>' +
        '<td class="co-cell-amount">' + netTotal + '</td>' +
        '<td style="text-align:center;">' +
        '<button class="co-download-btn" data-grn-id="' + grn.id + '" title="Download GRN PDF" aria-label="Download GRN">' +
        '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
  }

  // ── Load data ─────────────────────────────────────────────────────

  async function loadPendingOrders() {
    try {
      var result = await db
        .from('supplier_orders')
        .select('*, supplier_order_items(*)')
        .is('grn_id', null)
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      pendingOrders = (result.data || []).map(normalizeOrder);

      // Remove stale selections
      var validIds = new Set(pendingOrders.map(function (o) { return o.id; }));
      selectedOrderIds.forEach(function (id) { if (!validIds.has(id)) selectedOrderIds.delete(id); });

      renderPendingOrders();
    } catch (err) {
      console.error('Failed to load pending orders:', err);
      pendingList.innerHTML = '<div class="orders-empty">Could not load orders. Please refresh.</div>';
    }
  }

  async function loadGrnList() {
    try {
      var result = await db
        .from('grns')
        .select('*, supplier_orders(supplier_name, reference, order_date, net_total, total_quantity)')
        .order('confirmed_at', { ascending: false });

      if (result.error) throw result.error;

      grnList = result.data || [];
      renderGrnRegister();
    } catch (err) {
      console.error('Failed to load GRN list:', err);
    }
  }

  // ── Generate GRN flow ─────────────────────────────────────────────

  async function handleGenerate() {
    var selected = pendingOrders.filter(function (o) { return selectedOrderIds.has(o.id); });

    if (!selected.length) {
      window.alert('Select at least one supplier order to generate a GRN.');
      return;
    }

    setButtonBusy(btnGenerate, true, 'Generate GRN', 'Generating…');

    try {
      await loadPdfDeps();
      if (selected.length > 1) await loadZipDep();
    } catch (e) {
      window.alert('Could not load the GRN template. Please refresh and try again.');
      setButtonBusy(btnGenerate, false, 'Generate GRN', 'Generating…');
      return;
    }

    try {
      var pdfResults = await buildAllGrnPdfs(selected);

      if (pdfResults.length === 1) {
        // Single order — open A5 PDF in new tab for review
        var blob = new Blob([pdfResults[0].bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
      } else {
        // Multiple orders — ZIP all A5 PDFs and trigger download
        var zip = new window.JSZip();
        pdfResults.forEach(function (r) { zip.file(r.filename, r.bytes); });
        var now = new Date();
        var zipName = 'GRNs-' + String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate()) + '.zip';
        var zipBlob = await zip.generateAsync({ type: 'blob' });
        var zipUrl = URL.createObjectURL(zipBlob);
        var a = document.createElement('a');
        a.href = zipUrl;
        a.download = zipName;
        a.click();
        window.setTimeout(function () { URL.revokeObjectURL(zipUrl); }, 8000);
      }

      pendingGrnState = { selectedOrders: selected };
      confirmBar.classList.remove('grn-confirm-bar--hidden');
      confirmBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      console.error('GRN generation failed:', err);
      window.alert('Could not generate the GRN PDF. Please try again.');
    } finally {
      setButtonBusy(btnGenerate, false, 'Generate GRN', 'Generating…');
    }
  }

  // ── Confirm GRN ───────────────────────────────────────────────────

  async function handleConfirm() {
    if (!pendingGrnState) return;

    setButtonBusy(btnConfirm, true, 'Confirm & Save GRN', 'Saving…');
    btnDiscard.disabled = true;

    try {
      var selectedOrders = pendingGrnState.selectedOrders;
      var now = new Date();
      var batchDate = String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate());

      // Insert one GRN record per order and link them individually
      for (var oi = 0; oi < selectedOrders.length; oi++) {
        var ord = selectedOrders[oi];
        var grnRes = await db.from('grns').insert([{
          batch_date: batchDate,
          order_count: 1,
          total_items: ord.total_quantity || 0,
          net_total: roundCurrency(Number(ord.net_total || 0)),
        }]).select('id');

        if (grnRes.error) throw grnRes.error;

        var linkRes = await db.from('supplier_orders')
          .update({ grn_id: grnRes.data[0].id })
          .eq('id', ord.id);
        if (linkRes.error) throw linkRes.error;
      }

      // Update product stock quantities
      var stockMap = {};
      selectedOrders.forEach(function (order) {
        order.lineItems.forEach(function (item) {
          stockMap[item.productName] = (stockMap[item.productName] || 0) + item.quantity;
        });
      });

      var productNames = Object.keys(stockMap);
      for (var i = 0; i < productNames.length; i++) {
        var name = productNames[i];
        var qty = stockMap[name];
        var fetchRes = await db.from('products').select('id, stock_quantity').eq('name', name);
        if (!fetchRes.error && fetchRes.data) {
          for (var j = 0; j < fetchRes.data.length; j++) {
            var prod = fetchRes.data[j];
            await db.from('products').update({
              stock_quantity: (prod.stock_quantity || 0) + qty,
            }).eq('id', prod.id);
          }
        }
      }

      pendingGrnState = null;
      confirmBar.classList.add('grn-confirm-bar--hidden');
      selectedOrderIds.clear();

      await loadPendingOrders();
      await loadGrnList();
    } catch (err) {
      console.error('Failed to confirm GRN:', err);
      window.alert('Could not save the GRN. Please try again.');
    } finally {
      setButtonBusy(btnConfirm, false, 'Confirm & Save GRN', 'Saving…');
      btnDiscard.disabled = false;
    }
  }

  // ── Discard GRN ───────────────────────────────────────────────────

  function handleDiscard() {
    pendingGrnState = null;
    confirmBar.classList.add('grn-confirm-bar--hidden');
  }

  // ── Download GRN from register ────────────────────────────────────

  async function downloadGrn(grnId) {
    try {
      var result = await db
        .from('supplier_orders')
        .select('*, supplier_order_items(*)')
        .eq('grn_id', grnId)
        .single();

      if (result.error) throw result.error;

      await loadPdfDeps();
      var pdfResults = await buildAllGrnPdfs([normalizeOrder(result.data)]);
      var blob = new Blob([pdfResults[0].bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = pdfResults[0].filename;
      a.click();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (err) {
      console.error('Failed to download GRN:', err);
      window.alert('Could not generate the GRN PDF. Please try again.');
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  btnSelectAll.addEventListener('click', function () {
    pendingOrders.forEach(function (o) { selectedOrderIds.add(o.id); });
    renderPendingOrders();
  });

  btnClearAll.addEventListener('click', function () {
    selectedOrderIds.clear();
    renderPendingOrders();
  });

  btnGenerate.addEventListener('click', handleGenerate);
  btnConfirm.addEventListener('click', handleConfirm);
  btnDiscard.addEventListener('click', handleDiscard);

  pendingList.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-action="toggle-order"]');
    if (!toggle) return;
    var card = toggle.closest('[data-order-id]');
    if (!card) return;
    var id = Number(card.dataset.orderId);
    if (toggle.checked) {
      selectedOrderIds.add(id);
    } else {
      selectedOrderIds.delete(id);
    }
    renderPendingOrders();
  });

  grnTbody.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-grn-id]');
    if (btn) downloadGrn(Number(btn.dataset.grnId));
  });

  // ── Init ──────────────────────────────────────────────────────────
  loadPendingOrders();
  loadGrnList();
})();
