SELECT
    item_code AS itemCode
FROM schedule_item_aliases
WHERE state_kind = ?
  AND alias_code = ?
ORDER BY item_code ASC
LIMIT 1;
