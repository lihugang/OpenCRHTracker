DELETE FROM daily_emu_routes
WHERE train_code = ?
  AND emu_code = ?
  AND start_at = ?;
