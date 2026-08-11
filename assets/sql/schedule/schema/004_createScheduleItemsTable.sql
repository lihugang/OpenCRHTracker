CREATE TABLE IF NOT EXISTS schedule_items (
    state_kind TEXT NOT NULL,
    item_prefix TEXT NOT NULL DEFAULT '',
    item_number INTEGER NOT NULL DEFAULT 0 CHECK(item_number >= 0 AND item_number <= 9999),
    item_code TEXT GENERATED ALWAYS AS (item_prefix || item_number) VIRTUAL,
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
    PRIMARY KEY (state_kind, item_prefix, item_number),
    UNIQUE (state_kind, item_code),
    FOREIGN KEY(state_kind) REFERENCES schedule_states(kind) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_start
ON schedule_items(state_kind, start_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_internal
ON schedule_items(state_kind, internal_code);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_refresh
ON schedule_items(state_kind, last_route_refresh_at, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_items_state_train
ON schedule_items(state_kind, item_prefix, item_number, item_index);
