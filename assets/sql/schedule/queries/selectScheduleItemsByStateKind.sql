SELECT
    item_code AS itemCode,
    item_index AS itemIndex,
    internal_code AS internalCode,
    bureau_code AS bureauCode,
    train_style AS trainStyle,
    train_department AS trainDepartment,
    passenger_department AS passengerDepartment,
    start_station AS startStation,
    end_station AS endStation,
    start_at AS startAt,
    end_at AS endAt,
    last_route_refresh_at AS lastRouteRefreshAt
FROM schedule_items
WHERE state_kind = ?
ORDER BY item_index ASC;
