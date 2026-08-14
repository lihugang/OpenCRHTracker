DELETE FROM daily_emu_routes
WHERE train_prefix = ?
  AND train_number = ?
  AND service_date >= ?
  AND service_date <= ?;
