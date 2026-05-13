(function () {
  var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function applyToGlobals(dbRows) {
    // Build MEDIVEX_PRODUCTS from all rows with a unit_price
    var invRows = dbRows.filter(function (r) { return r.unit_price != null; });
    window.MEDIVEX_PRODUCTS = invRows.map(function (r) {
      return { name: r.name, unitPrice: Number(r.unit_price) };
    });

    // Build MEDIVEX_SUPPLIER_DIRECTORY from all rows with a supplier + unit_cost
    var supRows = dbRows.filter(function (r) { return r.supplier && r.unit_cost != null; });
    var supplierSet = {};
    supRows.forEach(function (r) { supplierSet[r.supplier] = true; });

    window.MEDIVEX_SUPPLIER_DIRECTORY = {
      suppliers: Object.keys(supplierSet).sort(),
      supplierAliases: {},
      products: supRows.map(function (r) {
        return { supplier: r.supplier, product: r.name, unitCost: Number(r.unit_cost) };
      }),
      missingUnitCosts: [],
    };
  }

  async function initProducts() {
    var result = await db.from('products').select('id, supplier, name, unit_cost, unit_price');
    if (result.error || !result.data) return;
    if (result.data.length > 0) applyToGlobals(result.data);
  }

  window.MVB_DB = db;

  window.MVB_PRICE_STORE = {
    initProducts: initProducts,

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
