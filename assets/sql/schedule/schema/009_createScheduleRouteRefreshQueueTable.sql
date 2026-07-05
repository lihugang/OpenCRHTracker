CREATE TABLE IF NOT EXISTS schedule_route_refresh_queue (
    service_date TEXT NOT NULL,
    train_code TEXT NOT NULL,
    enqueued_at INTEGER NOT NULL,
    PRIMARY KEY (service_date, train_code)
);

CREATE INDEX IF NOT EXISTS idx_schedule_route_refresh_queue_enqueued
ON schedule_route_refresh_queue(enqueued_at, service_date, train_code);
