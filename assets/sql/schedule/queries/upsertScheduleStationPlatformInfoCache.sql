INSERT INTO schedule_station_platform_info_cache (
    lookup_type,
    internal_code,
    station_telecode,
    station_train_prefix,
    station_train_number,
    platform_no,
    wicket,
    train_date,
    fetched_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(lookup_type, internal_code, station_telecode, station_train_prefix, station_train_number)
DO UPDATE SET
    platform_no = excluded.platform_no,
    wicket = excluded.wicket,
    train_date = excluded.train_date,
    fetched_at = excluded.fetched_at;
