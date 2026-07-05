CREATE TABLE IF NOT EXISTS schedule_circulations (
    entry_key TEXT PRIMARY KEY,
    refreshed_at INTEGER NOT NULL,
    entry_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_circulations_refreshed
ON schedule_circulations(refreshed_at DESC, entry_key);
