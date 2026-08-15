SELECT
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
FROM probe_status
WHERE service_date = ?
ORDER BY id ASC;
