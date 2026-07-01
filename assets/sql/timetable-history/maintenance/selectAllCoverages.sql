SELECT
    id,
    train_code,
    service_date_start,
    service_date_end_exclusive,
    content_id,
    created_at,
    updated_at
FROM timetable_history_coverages
ORDER BY train_code ASC, service_date_start ASC, id ASC;
