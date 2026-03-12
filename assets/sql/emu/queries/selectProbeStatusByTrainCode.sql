SELECT id, train_code, emu_train_set_no, status
FROM probe_status
WHERE train_code = ?
ORDER BY id ASC;
