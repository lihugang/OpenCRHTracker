DELETE FROM daily_emu_routes
WHERE train_code = ?
  AND start_at >= ?
  AND start_at < ?;
