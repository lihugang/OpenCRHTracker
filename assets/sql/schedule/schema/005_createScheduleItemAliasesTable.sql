CREATE TABLE IF NOT EXISTS schedule_item_aliases (
    state_kind TEXT NOT NULL,
    item_code TEXT NOT NULL,
    alias_code TEXT NOT NULL,
    alias_index INTEGER NOT NULL,
    PRIMARY KEY (state_kind, item_code, alias_code),
    FOREIGN KEY(state_kind, item_code) REFERENCES schedule_items(state_kind, item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_item_aliases_state_alias
ON schedule_item_aliases(state_kind, alias_code, item_code);
