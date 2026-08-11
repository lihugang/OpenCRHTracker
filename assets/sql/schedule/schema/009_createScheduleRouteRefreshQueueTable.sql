CREATE TABLE IF NOT EXISTS schedule_route_refresh_queue (
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    enqueued_at INTEGER NOT NULL,
    PRIMARY KEY (service_date, train_prefix, train_number)
);

CREATE INDEX IF NOT EXISTS idx_schedule_route_refresh_queue_enqueued
ON schedule_route_refresh_queue(enqueued_at, service_date, train_prefix, train_number);
