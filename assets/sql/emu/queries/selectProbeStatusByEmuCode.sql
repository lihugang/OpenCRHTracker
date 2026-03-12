SELECT id, train_code, emu_code, status
FROM probe_status
WHERE emu_code = ?
ORDER BY id ASC;
