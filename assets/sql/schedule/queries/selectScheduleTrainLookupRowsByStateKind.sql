SELECT
    item_code AS itemCode,
    start_station AS startStation,
    end_station AS endStation
FROM schedule_items
WHERE state_kind = ?
ORDER BY item_index ASC;
