SELECT
    id,
    train_code,
    emu_code,
    start_at,
    status
FROM probe_status
WHERE train_code = ?
  AND start_at >= ?
  AND start_at < ?
ORDER BY start_at ASC, id ASC;
