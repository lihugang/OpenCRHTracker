INSERT OR IGNORE INTO probe_untrusted_records (
    train_prefix,
    train_number,
    emu_id,
    service_date,
    reason,
    detail,
    created_at
) VALUES (?, ?, ?, ?, ?, ?, ?);
