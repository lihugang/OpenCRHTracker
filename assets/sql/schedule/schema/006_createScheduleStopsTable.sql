CREATE TABLE IF NOT EXISTS schedule_stops (
    state_kind TEXT NOT NULL,
    item_code TEXT NOT NULL,
    stop_index INTEGER NOT NULL,
    station_no INTEGER NOT NULL,
    station_name TEXT NOT NULL,
    station_telecode TEXT NOT NULL,
    arrive_at INTEGER,
    depart_at INTEGER,
    station_train_code TEXT NOT NULL,
    wicket TEXT NOT NULL,
    distance INTEGER,
    platform_no INTEGER,
    is_start INTEGER NOT NULL,
    is_end INTEGER NOT NULL,
    PRIMARY KEY (state_kind, item_code, stop_index),
    FOREIGN KEY(state_kind, item_code) REFERENCES schedule_items(state_kind, item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_station_name
ON schedule_stops(state_kind, station_name, arrive_at, depart_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_station_telecode
ON schedule_stops(state_kind, station_telecode, arrive_at, depart_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_item_station_no
ON schedule_stops(state_kind, item_code, station_no);
