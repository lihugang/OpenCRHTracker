DELETE FROM probe_status
WHERE train_code = ?
  AND start_at >= ?
  AND start_at < ?;
