SELECT 1
FROM probe_untrusted_records
WHERE train_code = ?
  AND emu_code = ?
  AND service_date = ?
LIMIT 1;
