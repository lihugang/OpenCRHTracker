SELECT
    id,
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
FROM station_platform_refresh_entries
WHERE refresh_result_id = ?
ORDER BY station_order ASC, station_no ASC, id ASC;
