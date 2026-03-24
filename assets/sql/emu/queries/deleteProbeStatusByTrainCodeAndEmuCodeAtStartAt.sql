DELETE FROM probe_status
WHERE train_code = ?
  AND emu_code = ?
  AND start_at = ?;
