CREATE TABLE IF NOT EXISTS schedule_circulation_lookups (
    entry_key TEXT NOT NULL,
    lookup_code TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('internal_code', 'all_code')),
    PRIMARY KEY (entry_key, lookup_code, match_type),
    FOREIGN KEY(entry_key) REFERENCES schedule_circulations(entry_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_circulation_lookups_code
ON schedule_circulation_lookups(lookup_code, match_type, entry_key);
