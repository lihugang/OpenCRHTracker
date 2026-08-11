SELECT
    id,
    train_prefix,
    train_number,
    service_date_start,
    service_date_end_exclusive,
    content_id,
    created_at,
    updated_at
FROM timetable_history_coverages
ORDER BY train_prefix ASC, train_number ASC, service_date_start ASC, id ASC;
