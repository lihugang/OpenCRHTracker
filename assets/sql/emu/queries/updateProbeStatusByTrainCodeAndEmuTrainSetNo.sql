UPDATE probe_status
SET status = ?
WHERE train_code = ? AND emu_train_set_no = ?;
