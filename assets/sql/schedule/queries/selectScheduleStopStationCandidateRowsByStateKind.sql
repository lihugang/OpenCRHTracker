SELECT
    stops.station_name AS stationName,
    stops.station_telecode AS stationTelecode
FROM schedule_stops stops
INNER JOIN schedule_items items
ON items.state_kind = stops.state_kind
AND items.item_code = stops.item_code
WHERE stops.state_kind = ?
ORDER BY items.item_index ASC, stops.stop_index ASC;
