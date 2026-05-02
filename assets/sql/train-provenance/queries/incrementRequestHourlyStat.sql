INSERT INTO request_hourly_stats (
    bucket_start,
    service_date,
    request_type,
    is_success,
    request_count,
    updated_at
) VALUES (?, ?, ?, ?, 1, ?)
ON CONFLICT(bucket_start, request_type, is_success) DO UPDATE SET
    request_count = request_hourly_stats.request_count + 1,
    service_date = excluded.service_date,
    updated_at = excluded.updated_at;
