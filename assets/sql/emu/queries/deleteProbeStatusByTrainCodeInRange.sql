DELETE FROM probe_status
WHERE train_prefix = ?
  AND train_number = ?
  AND service_date >= ?
  AND service_date <= ?;
