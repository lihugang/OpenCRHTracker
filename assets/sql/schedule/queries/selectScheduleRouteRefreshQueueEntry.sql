SELECT
    train_prefix AS trainPrefix,
    train_number AS trainNumber,
    service_date AS serviceDate,
    enqueued_at AS enqueuedAt
FROM schedule_route_refresh_queue
WHERE service_date = ?
AND train_prefix = ?
AND train_number = ?;
