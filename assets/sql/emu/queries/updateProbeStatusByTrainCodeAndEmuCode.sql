UPDATE probe_status
SET status = ?
WHERE train_code = ? AND emu_code = ? AND start_at = ?;
