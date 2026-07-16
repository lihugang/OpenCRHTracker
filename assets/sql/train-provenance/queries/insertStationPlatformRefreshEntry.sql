INSERT INTO station_platform_refresh_entries (
    refresh_result_id,
    station_order,
    lookup_type,
    station_name,
    station_telecode,
    station_no,
    train_date,
    station_train_codes_json,
    attempted_train_codes_json,
    status,
    platform_no,
    wicket,
    fetched_at,
    error_message
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
