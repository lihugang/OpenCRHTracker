SELECT
    items.item_code AS itemCode,
    items.item_index AS itemIndex,
    items.internal_code AS internalCode,
    items.bureau_code AS bureauCode,
    items.train_style AS trainStyle,
    items.train_department AS trainDepartment,
    items.passenger_department AS passengerDepartment,
    items.start_station AS startStation,
    items.end_station AS endStation,
    items.start_at AS startAt,
    items.end_at AS endAt,
    items.last_route_refresh_at AS lastRouteRefreshAt
FROM schedule_item_aliases aliases
INNER JOIN schedule_items items
ON items.state_kind = aliases.state_kind
AND items.item_code = aliases.item_code
WHERE aliases.state_kind = ?
AND aliases.alias_code = ?
ORDER BY items.item_index ASC, items.item_code ASC;
