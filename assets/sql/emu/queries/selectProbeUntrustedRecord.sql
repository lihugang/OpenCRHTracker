SELECT 1
FROM probe_untrusted_records
WHERE train_prefix = ?
  AND train_number = ?
  AND emu_id = ?
  AND service_date = ?
LIMIT 1;
