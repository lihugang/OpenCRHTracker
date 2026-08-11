DELETE FROM probe_status
WHERE train_prefix = ?
  AND train_number = ?
  AND emu_id = ?
  AND service_date = ?;
