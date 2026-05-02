DELETE FROM probe_status
WHERE train_code = ?
  AND emu_code = ?
  AND service_date = ?;
