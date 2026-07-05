CREATE TABLE IF NOT EXISTS schedule_items (
    state_kind TEXT NOT NULL,
    item_code TEXT NOT NULL,
    item_index INTEGER NOT NULL,
    internal_code TEXT NOT NULL,
    bureau_code TEXT NOT NULL,
    train_style TEXT NOT NULL,
    train_department TEXT NOT NULL,
    passenger_department TEXT NOT NULL,
    start_station TEXT NOT NULL,
    end_station TEXT NOT NULL,
    start_at INTEGER,
    end_at INTEGER,
    last_route_refresh_at INTEGER,
    PRIMARY KEY (state_kind, item_code),
    FOREIGN KEY(state_kind) REFERENCES schedule_states(kind) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_start
ON schedule_items(state_kind, start_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_internal
ON schedule_items(state_kind, internal_code);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_refresh
ON schedule_items(state_kind, last_route_refresh_at, item_code);
