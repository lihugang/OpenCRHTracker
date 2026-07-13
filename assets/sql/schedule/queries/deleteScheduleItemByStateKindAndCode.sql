DELETE FROM schedule_items
WHERE state_kind = ?
  AND item_code = ?;
