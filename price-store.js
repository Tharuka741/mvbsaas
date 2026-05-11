(function () {
  var INVOICE_KEY = 'mvb_invoice_prices';
  var SUPPLIER_KEY = 'mvb_supplier_costs';

  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
      return {};
    }
  }

  function persist(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
  }

  // Snapshot base defaults before overrides are applied
  window.MVB_BASE_PRODUCTS = (window.MEDIVEX_PRODUCTS || []).map(function (p) {
    return { name: p.name, unitPrice: p.unitPrice };
  });

  window.MVB_BASE_SUPPLIER = {
    products: ((window.MEDIVEX_SUPPLIER_DIRECTORY || {}).products || []).map(function (p) {
      return { supplier: p.supplier, product: p.product, unitCost: p.unitCost };
    }),
  };

  // Apply invoice price overrides to window global
  var invOverrides = load(INVOICE_KEY);
  if (window.MEDIVEX_PRODUCTS) {
    window.MEDIVEX_PRODUCTS = window.MEDIVEX_PRODUCTS.map(function (p) {
      if (Object.prototype.hasOwnProperty.call(invOverrides, p.name)) {
        return Object.assign({}, p, { unitPrice: invOverrides[p.name] });
      }
      return p;
    });
  }

  // Apply supplier cost overrides to window global
  var supOverrides = load(SUPPLIER_KEY);
  if (window.MEDIVEX_SUPPLIER_DIRECTORY && window.MEDIVEX_SUPPLIER_DIRECTORY.products) {
    window.MEDIVEX_SUPPLIER_DIRECTORY = Object.assign({}, window.MEDIVEX_SUPPLIER_DIRECTORY, {
      products: window.MEDIVEX_SUPPLIER_DIRECTORY.products.map(function (p) {
        var k = p.supplier + '|' + p.product;
        if (Object.prototype.hasOwnProperty.call(supOverrides, k)) {
          return Object.assign({}, p, { unitCost: supOverrides[k] });
        }
        return p;
      }),
    });
  }

  window.MVB_PRICE_STORE = {
    getInvoiceOverrides: function () { return load(INVOICE_KEY); },
    getSupplierOverrides: function () { return load(SUPPLIER_KEY); },
    saveInvoiceOverrides: function (obj) { persist(INVOICE_KEY, obj); },
    saveSupplierOverrides: function (obj) { persist(SUPPLIER_KEY, obj); },
    resetAll: function () {
      localStorage.removeItem(INVOICE_KEY);
      localStorage.removeItem(SUPPLIER_KEY);
    },
  };
})();
