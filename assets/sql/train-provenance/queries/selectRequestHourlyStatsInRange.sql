SELECT
    bucket_start,
    service_date,
    request_type,
    is_success,
    request_count,
    updated_at
FROM request_hourly_stats
WHERE bucket_start >= ?
  AND bucket_start < ?
ORDER BY bucket_start ASC, request_type ASC, is_success ASC;
