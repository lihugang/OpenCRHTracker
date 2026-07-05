SELECT
    station_telecode AS stationTelecode,
    station_name AS stationName,
    lat,
    lon
FROM schedule_stations
ORDER BY station_telecode ASC;
