SELECT
    id,
    train_code,
    emu_code,
    service_date,
    timetable_id,
    status
FROM probe_status
ORDER BY id ASC;
