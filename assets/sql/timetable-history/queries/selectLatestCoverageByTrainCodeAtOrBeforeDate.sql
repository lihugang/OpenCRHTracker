SELECT
    id,
    train_code,
    service_date_start,
    service_date_end_exclusive,
    content_id,
    created_at,
    updated_at
FROM timetable_history_coverages
WHERE train_code = ?
  AND service_date_start <= ?
ORDER BY service_date_start DESC, id DESC
LIMIT 1;
