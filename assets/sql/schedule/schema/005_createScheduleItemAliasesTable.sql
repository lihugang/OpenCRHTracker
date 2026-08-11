CREATE TABLE IF NOT EXISTS schedule_item_aliases (
    state_kind TEXT NOT NULL,
    item_prefix TEXT NOT NULL DEFAULT '',
    item_number INTEGER NOT NULL DEFAULT 0 CHECK(item_number >= 0 AND item_number <= 9999),
    alias_prefix TEXT NOT NULL DEFAULT '',
    alias_number INTEGER NOT NULL DEFAULT 0 CHECK(alias_number >= 0 AND alias_number <= 9999),
    item_code TEXT GENERATED ALWAYS AS (item_prefix || item_number) VIRTUAL,
    alias_code TEXT GENERATED ALWAYS AS (alias_prefix || alias_number) VIRTUAL,
    alias_index INTEGER NOT NULL,
    PRIMARY KEY (state_kind, item_prefix, item_number, alias_prefix, alias_number),
    FOREIGN KEY(state_kind, item_prefix, item_number) REFERENCES schedule_items(state_kind, item_prefix, item_number) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_item_aliases_state_item_alias_code
ON schedule_item_aliases(state_kind, item_code, alias_code);

CREATE INDEX IF NOT EXISTS idx_schedule_item_aliases_state_alias
ON schedule_item_aliases(state_kind, alias_code, item_code);

CREATE INDEX IF NOT EXISTS idx_schedule_item_aliases_state_train
ON schedule_item_aliases(state_kind, alias_prefix, alias_number, item_code);
