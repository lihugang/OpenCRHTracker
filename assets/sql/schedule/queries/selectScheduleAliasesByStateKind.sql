SELECT
    item_code AS itemCode,
    alias_code AS aliasCode,
    alias_index AS aliasIndex
FROM schedule_item_aliases
WHERE state_kind = ?
ORDER BY item_code ASC, alias_index ASC;
