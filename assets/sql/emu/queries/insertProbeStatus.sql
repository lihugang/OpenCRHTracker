INSERT INTO probe_status (
    train_code,
    emu_code,
    service_date,
    timetable_id,
    status
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT DO NOTHING;
