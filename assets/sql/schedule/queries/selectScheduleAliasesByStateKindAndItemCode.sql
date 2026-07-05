SELECT
    alias_code AS aliasCode
FROM schedule_item_aliases
WHERE state_kind = ?
  AND item_code = ?
ORDER BY alias_index ASC;
