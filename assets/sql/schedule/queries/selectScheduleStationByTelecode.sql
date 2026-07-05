SELECT
    station_telecode AS stationTelecode,
    station_name AS stationName,
    lat,
    lon
FROM schedule_stations
WHERE station_telecode = ?;
