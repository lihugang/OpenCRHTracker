INSERT OR IGNORE INTO schedule_route_refresh_queue (
    service_date,
    train_code,
    enqueued_at
) VALUES (?, ?, ?);
