(function () {
  var SUPABASE_URL = 'https://slshvvchabaohxsdnehe.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_rbo_z0EqMsbXJ3GxKylDMQ_rIuyfSis';

  // supabase-js loaded via CDN before this script
  var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Invoice prices ────────────────────────────────────────────

  async function initInvoicePrices() {
    if (!window.MEDIVEX_PRODUCTS) return;

    // Snapshot the hard-coded defaults so the Price Manager can show them
    window.MVB_BASE_PRODUCTS = window.MEDIVEX_PRODUCTS.map(function (p) {
      return { name: p.name, unitPrice: p.unitPrice };
    });

    var result = await db.from('invoice_prices').select('name, unit_price');

    if (result.error) return; // Network issue — keep JS file defaults

    if (result.data.length === 0) {
      // First run: seed the table from products.js
      await db.from('invoice_prices').insert(
        window.MEDIVEX_PRODUCTS.map(function (p) {
          return { name: p.name, unit_price: p.unitPrice };
        })
      );
      return; // Defaults are already loaded in window.MEDIVEX_PRODUCTS
    }

    // Apply DB prices to the window global (app.js reads this next)
    var priceMap = {};
    result.data.forEach(function (r) {
      priceMap[r.name] = Number(r.unit_price);
    });

    window.MEDIVEX_PRODUCTS = window.MEDIVEX_PRODUCTS.map(function (p) {
      return priceMap[p.name] !== undefined
        ? Object.assign({}, p, { unitPrice: priceMap[p.name] })
        : p;
    });
  }

  // ── Supplier costs ────────────────────────────────────────────

  async function initSupplierCosts() {
    var dir = window.MEDIVEX_SUPPLIER_DIRECTORY;
    if (!dir || !dir.products) return;

    window.MVB_BASE_SUPPLIER = {
      products: dir.products.map(function (p) {
        return { supplier: p.supplier, product: p.product, unitCost: p.unitCost };
      }),
    };

    var result = await db.from('supplier_costs').select('supplier, product, unit_cost');

    if (result.error) return;

    if (result.data.length === 0) {
      await db.from('supplier_costs').insert(
        dir.products.map(function (p) {
          return { supplier: p.supplier, product: p.product, unit_cost: p.unitCost };
        })
      );
      return;
    }

    var costMap = {};
    result.data.forEach(function (r) {
      costMap[r.supplier + '|' + r.product] = Number(r.unit_cost);
    });

    window.MEDIVEX_SUPPLIER_DIRECTORY = Object.assign({}, dir, {
      products: dir.products.map(function (p) {
        var k = p.supplier + '|' + p.product;
        return costMap[k] !== undefined
          ? Object.assign({}, p, { unitCost: costMap[k] })
          : p;
      }),
    });
  }

  // ── Public API ────────────────────────────────────────────────

  window.MVB_DB = db;

  window.MVB_PRICE_STORE = {
    initInvoicePrices: initInvoicePrices,
    initSupplierCosts: initSupplierCosts,

    // Upsert the full invoice price list (used by Price Manager on save)
    saveAllInvoicePrices: function (rows) {
      // rows: [{ name, unit_price }, ...]
      return db.from('invoice_prices').upsert(rows, { onConflict: 'name' });
    },

    // Upsert the full supplier cost list (used by Price Manager on save)
    saveAllSupplierCosts: function (rows) {
      // rows: [{ supplier, product, unit_cost }, ...]
      return db.from('supplier_costs').upsert(rows, { onConflict: 'supplier,product' });
    },

    // Save a completed invoice + its line items (called on PDF download)
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
