DELETE FROM daily_emu_routes
WHERE train_prefix = ?
  AND train_number = ?
  AND emu_id = ?
  AND service_date = ?;
