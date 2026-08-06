DELETE FROM probe_untrusted_records
WHERE train_code = ?
  AND service_date >= ?
  AND service_date <= ?;
