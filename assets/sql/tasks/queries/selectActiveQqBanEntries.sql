SELECT
    qq_number,
    added_at,
    added_by
FROM qq_ban_list
WHERE is_active = 1
ORDER BY added_at DESC, qq_number ASC
