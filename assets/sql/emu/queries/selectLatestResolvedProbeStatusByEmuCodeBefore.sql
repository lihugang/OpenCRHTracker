SELECT id, train_code, emu_code, start_at, status
FROM probe_status
WHERE emu_code = ? AND start_at < ? AND status IN (2, 3)
ORDER BY start_at DESC, id DESC
LIMIT 1;
