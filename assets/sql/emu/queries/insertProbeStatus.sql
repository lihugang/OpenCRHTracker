INSERT INTO probe_status (
    train_code,
    emu_code,
    start_at,
    status
) VALUES (?, ?, ?, ?)
ON CONFLICT(train_code, emu_code, start_at)
DO UPDATE SET
    status = excluded.status;
