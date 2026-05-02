CREATE TABLE IF NOT EXISTS request_hourly_stats (
    bucket_start INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    request_type TEXT NOT NULL,
    is_success INTEGER NOT NULL CHECK (is_success IN (0, 1)),
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (bucket_start, request_type, is_success)
);

CREATE INDEX IF NOT EXISTS idx_request_hourly_stats_service_date
ON request_hourly_stats(service_date, bucket_start, request_type, is_success);

CREATE INDEX IF NOT EXISTS idx_request_hourly_stats_updated_at
ON request_hourly_stats(updated_at, bucket_start);
