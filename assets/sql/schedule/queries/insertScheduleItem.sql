INSERT INTO schedule_items (
    state_kind,
    item_code,
    item_index,
    internal_code,
    bureau_code,
    train_style,
    train_department,
    passenger_department,
    start_station,
    end_station,
    start_at,
    end_at,
    last_route_refresh_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
