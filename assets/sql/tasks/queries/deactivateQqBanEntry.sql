UPDATE qq_ban_list
SET is_active = 0,
    removed_at = ?,
    removed_by = ?
WHERE qq_number = ?
  AND is_active = 1
