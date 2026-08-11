INSERT OR IGNORE INTO schedule_item_aliases (
    state_kind,
    item_prefix,
    item_number,
    alias_prefix,
    alias_number,
    alias_index
) VALUES (?, ?, ?, ?, ?, ?);
