DELETE FROM probe_status
WHERE train_code = ?
  AND service_date >= ?
  AND service_date <= ?;
