INSERT INTO failed_codes (
    emu_code,
    seat_code,
    reason,
    checked_at,
    created_at,
    expected_train_code,
    detected_train_code,
    detected_emu_code
) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
