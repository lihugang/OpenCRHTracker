SELECT
    train_code AS trainCode,
    service_date AS serviceDate,
    enqueued_at AS enqueuedAt
FROM schedule_route_refresh_queue
ORDER BY enqueued_at ASC, service_date ASC, train_code ASC;
