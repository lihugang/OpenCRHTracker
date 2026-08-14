CREATE TABLE IF NOT EXISTS schedule_stops (
    state_kind TEXT NOT NULL,
    item_prefix TEXT NOT NULL DEFAULT '',
    item_number INTEGER NOT NULL DEFAULT 0 CHECK(item_number >= 0 AND item_number <= 9999),
    stop_index INTEGER NOT NULL,
    station_no INTEGER NOT NULL,
    station_name TEXT NOT NULL,
    station_telecode TEXT NOT NULL,
    arrive_at INTEGER,
    depart_at INTEGER,
    station_train_prefix TEXT NOT NULL DEFAULT '',
    station_train_number INTEGER NOT NULL DEFAULT 0 CHECK(station_train_number >= 0 AND station_train_number <= 9999),
    item_code TEXT GENERATED ALWAYS AS (item_prefix || item_number) VIRTUAL,
    station_train_code TEXT GENERATED ALWAYS AS (station_train_prefix || station_train_number) VIRTUAL,
    wicket TEXT NOT NULL,
    distance INTEGER,
    platform_no INTEGER,
    station_platform_info_fetched_at INTEGER,
    is_start INTEGER NOT NULL,
    is_end INTEGER NOT NULL,
    PRIMARY KEY (state_kind, item_prefix, item_number, stop_index),
    FOREIGN KEY(state_kind, item_prefix, item_number) REFERENCES schedule_items(state_kind, item_prefix, item_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_station_name
ON schedule_stops(state_kind, station_name, arrive_at, depart_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_station_telecode
ON schedule_stops(state_kind, station_telecode, arrive_at, depart_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_item_station_no
ON schedule_stops(state_kind, item_code, station_no);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_state_train
ON schedule_stops(state_kind, station_train_prefix, station_train_number, station_no);
