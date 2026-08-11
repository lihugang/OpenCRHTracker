DELETE FROM probe_untrusted_records
WHERE train_prefix = ?
  AND train_number = ?
  AND service_date >= ?
  AND service_date <= ?;
