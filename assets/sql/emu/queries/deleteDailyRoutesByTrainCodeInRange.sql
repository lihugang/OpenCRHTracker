DELETE FROM daily_emu_routes
WHERE train_code = ?
  AND service_date >= ?
  AND service_date <= ?;
