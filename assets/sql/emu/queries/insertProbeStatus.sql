INSERT INTO probe_status (
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT DO NOTHING;
