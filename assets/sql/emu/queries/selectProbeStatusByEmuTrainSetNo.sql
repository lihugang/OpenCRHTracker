SELECT id, train_code, emu_train_set_no, status
FROM probe_status
WHERE emu_train_set_no = ?
ORDER BY id ASC;
