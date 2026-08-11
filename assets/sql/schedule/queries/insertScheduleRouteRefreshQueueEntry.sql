INSERT OR REPLACE INTO schedule_route_refresh_queue (
    service_date,
    train_prefix,
    train_number,
    enqueued_at
) VALUES (?, ?, ?, ?);
