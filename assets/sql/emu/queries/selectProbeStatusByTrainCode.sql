SELECT id, train_code, emu_code, start_at, status
FROM probe_status
WHERE train_code = ? AND start_at = ?
ORDER BY id ASC;
