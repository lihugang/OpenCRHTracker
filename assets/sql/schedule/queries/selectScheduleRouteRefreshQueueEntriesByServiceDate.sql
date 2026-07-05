SELECT
    train_code AS trainCode,
    service_date AS serviceDate,
    enqueued_at AS enqueuedAt
FROM schedule_route_refresh_queue
WHERE service_date = ?
ORDER BY enqueued_at ASC, train_code ASC;
