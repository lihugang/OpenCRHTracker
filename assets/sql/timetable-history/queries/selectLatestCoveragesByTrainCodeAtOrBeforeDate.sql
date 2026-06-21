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
ORDER BY
    CASE
        WHEN service_date_end_exclusive > ? THEN 0
        ELSE 1
    END,
    service_date_start DESC,
    id DESC
LIMIT ?;
