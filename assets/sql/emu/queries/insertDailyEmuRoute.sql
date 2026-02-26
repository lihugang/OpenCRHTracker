INSERT INTO daily_emu_routes (
    train_code,
    emu_code,
    start_at,
    end_at
) VALUES (?, ?, ?, ?)
ON CONFLICT(train_code, emu_code, start_at)
DO UPDATE SET
    end_at = excluded.end_at;
