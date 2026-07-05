CREATE TABLE IF NOT EXISTS schedule_stations (
    station_telecode TEXT PRIMARY KEY,
    station_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_stations_name
ON schedule_stations(station_name);
