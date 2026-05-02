DELETE FROM request_hourly_stats
WHERE bucket_start < ?;
