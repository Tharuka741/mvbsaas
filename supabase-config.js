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

  // Rebuild window globals directly from Supabase rows — no name-matching needed
  function applyToGlobals(dbRows) {
    // Replace MEDIVEX_PRODUCTS with all rows that have a unit_price
    if (window.MEDIVEX_PRODUCTS) {
      var invRows = dbRows.filter(function (r) { return r.unit_price != null; });
      if (invRows.length > 0) {
        window.MEDIVEX_PRODUCTS = invRows.map(function (r) {
          return { name: r.name, unitPrice: Number(r.unit_price) };
        });
      }
    }

    // Replace MEDIVEX_SUPPLIER_DIRECTORY.products and rebuild the suppliers list
    var dir = window.MEDIVEX_SUPPLIER_DIRECTORY;
    if (dir) {
      var supRows = dbRows.filter(function (r) { return r.supplier && r.unit_cost != null; });
      if (supRows.length > 0) {
        // Derive unique supplier names directly from DB so Manager edits are reflected
        var supplierSet = {};
        supRows.forEach(function (r) { supplierSet[r.supplier] = true; });
        var supplierList = Object.keys(supplierSet).sort();

        window.MEDIVEX_SUPPLIER_DIRECTORY = Object.assign({}, dir, {
          suppliers: supplierList,
          products: supRows.map(function (r) {
            return { supplier: r.supplier, product: r.name, unitCost: Number(r.unit_cost) };
          }),
        });
      }
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
