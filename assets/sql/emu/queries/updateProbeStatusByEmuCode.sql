UPDATE probe_status
SET status = ?
WHERE emu_code = ? AND start_at = ?;
