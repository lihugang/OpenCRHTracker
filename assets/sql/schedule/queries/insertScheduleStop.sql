INSERT INTO schedule_stops (
    state_kind,
    item_code,
    stop_index,
    station_no,
    station_name,
    station_telecode,
    arrive_at,
    depart_at,
    station_train_code,
    wicket,
    distance,
    platform_no,
    station_platform_info_fetched_at,
    is_start,
    is_end
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
