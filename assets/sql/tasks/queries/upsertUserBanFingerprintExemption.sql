INSERT INTO user_ban_fingerprint_exemptions (
    user_id,
    fingerprint_id,
    unban_action_id,
    created_at,
    created_by,
    expires_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id, fingerprint_id) DO UPDATE SET
    unban_action_id = excluded.unban_action_id,
    created_at = excluded.created_at,
    created_by = excluded.created_by,
    expires_at = excluded.expires_at
