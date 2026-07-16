SELECT
    id,
    task_run_id,
    service_date,
    start_at,
    primary_train_code,
    train_codes_json,
    trigger,
    status,
    candidate_count,
    updated_count,
    cache_hit_count,
    cache_fallback_count,
    no_data_count,
    failed_count,
    error_message,
    created_at
FROM station_platform_refresh_results
WHERE id = ?;
