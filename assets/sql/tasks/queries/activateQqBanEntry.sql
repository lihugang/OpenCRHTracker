INSERT INTO qq_ban_list (
    qq_number,
    is_active,
    added_at,
    added_by,
    removed_at,
    removed_by
) VALUES (?, 1, ?, ?, NULL, NULL)
ON CONFLICT(qq_number) DO UPDATE SET
    is_active = 1,
    added_at = excluded.added_at,
    added_by = excluded.added_by,
    removed_at = NULL,
    removed_by = NULL
