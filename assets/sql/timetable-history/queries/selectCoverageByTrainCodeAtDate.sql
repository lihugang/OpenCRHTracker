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
WHERE train_prefix = ?
  AND train_number = ?
  AND service_date_start <= ?
  AND service_date_end_exclusive > ?
ORDER BY service_date_start DESC, id DESC
LIMIT 1;
