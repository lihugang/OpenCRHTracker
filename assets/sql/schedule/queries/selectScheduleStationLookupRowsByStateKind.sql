SELECT
    station_name AS stationName,
    COUNT(DISTINCT item_code) AS stopCount
FROM schedule_stops
WHERE state_kind = ?
  AND station_name <> ''
GROUP BY station_name
ORDER BY station_name ASC;
