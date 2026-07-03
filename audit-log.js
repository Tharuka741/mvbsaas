(function () {
  // Fire-and-forget audit logging. Callers should NOT await log() — it must
  // never add latency to, or block, the primary business operation. Any
  // failure (network, RLS, etc.) is swallowed and only console.warn'd.
  function log(entry) {
    try {
      var db = window.MVB_DB;
      var user = window.MVB_USER || {};

      var row = {
        user_id: user.id || null,
        user_name: user.name || null,
        user_role: user.role || null,
        module: entry.module,
        action: entry.action,
        record_type: entry.recordType != null ? String(entry.recordType) : null,
        record_id: entry.recordId != null ? String(entry.recordId) : null,
        description: entry.description || null,
        old_data: entry.oldData != null ? entry.oldData : null,
        new_data: entry.newData != null ? entry.newData : null,
        success: entry.success !== false,
      };

      db.from('audit_logs').insert([row]).then(function (result) {
        if (result.error) console.warn('Audit log failed:', result.error);
      });
    } catch (err) {
      console.warn('Audit log failed:', err);
    }
  }

  window.MVB_AUDIT_LOG = { log: log };
})();
