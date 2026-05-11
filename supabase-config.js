(function () {
  var SUPABASE_URL = 'https://slshvvchabaohxsdnehe.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_rbo_z0EqMsbXJ3GxKylDMQ_rIuyfSis';

  var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Merge products.js + supplier-data.js into unified rows for first-run seeding
  function buildSeedRows() {
    var invProducts = window.MEDIVEX_PRODUCTS || [];
    var supProducts = ((window.MEDIVEX_SUPPLIER_DIRECTORY || {}).products) || [];

    var invPriceMap = {};
    invProducts.forEach(function (p) { invPriceMap[p.name] = p.unitPrice; });

    var rows = [];
    var seen = {};

    supProducts.forEach(function (p) {
      rows.push({
        supplier: p.supplier,
        name: p.product,
        unit_cost: p.unitCost,
        unit_price: invPriceMap[p.product] !== undefined ? invPriceMap[p.product] : null,
      });
      seen[p.product] = true;
    });

    invProducts.forEach(function (p) {
      if (!seen[p.name]) {
        rows.push({ supplier: null, name: p.name, unit_cost: null, unit_price: p.unitPrice });
      }
    });

    return rows;
  }

  // Apply DB product rows back to the window globals app.js / supplier-orders.js read
  function applyToGlobals(dbRows) {
    var invMap = {};   // name → unit_price
    var supMap = {};   // "supplier|name" → unit_cost

    dbRows.forEach(function (r) {
      if (r.unit_price != null) invMap[r.name] = Number(r.unit_price);
      if (r.unit_cost != null && r.supplier) supMap[r.supplier + '|' + r.name] = Number(r.unit_cost);
    });

    if (window.MEDIVEX_PRODUCTS) {
      window.MEDIVEX_PRODUCTS = window.MEDIVEX_PRODUCTS.map(function (p) {
        return invMap[p.name] !== undefined
          ? Object.assign({}, p, { unitPrice: invMap[p.name] })
          : p;
      });
    }

    var dir = window.MEDIVEX_SUPPLIER_DIRECTORY;
    if (dir && dir.products) {
      window.MEDIVEX_SUPPLIER_DIRECTORY = Object.assign({}, dir, {
        products: dir.products.map(function (p) {
          var k = p.supplier + '|' + p.product;
          return supMap[k] !== undefined
            ? Object.assign({}, p, { unitCost: supMap[k] })
            : p;
        }),
      });
    }
  }

  async function initProducts() {
    var result = await db.from('products').select('id, supplier, name, unit_cost, unit_price');

    if (result.error) return; // network issue — keep JS file defaults

    if (result.data.length === 0) {
      // First run: seed from the JS files then return (defaults already in window globals)
      var rows = buildSeedRows();
      if (rows.length) await db.from('products').insert(rows);
      return;
    }

    applyToGlobals(result.data);
  }

  window.MVB_DB = db;

  window.MVB_PRICE_STORE = {
    initProducts: initProducts,

    // Save a completed invoice + line items when the PDF is downloaded
    saveInvoice: async function (invoice, lineItems) {
      var invResult = await db
        .from('invoices')
        .upsert([invoice], { onConflict: 'invoice_number' })
        .select('id');

      if (invResult.error || !invResult.data || !invResult.data.length) return;

      var invoiceId = invResult.data[0].id;
      await db.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
      await db.from('invoice_line_items').insert(
        lineItems.map(function (item) {
          return Object.assign({ invoice_id: invoiceId }, item);
        })
      );
    },
  };
})();
