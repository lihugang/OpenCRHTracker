INSERT INTO user_ban_fingerprints (
    ip_address,
    user_agent,
    first_action_id,
    latest_action_id,
    last_banned_at,
    expires_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(ip_address, user_agent) DO UPDATE SET
    latest_action_id = excluded.latest_action_id,
    last_banned_at = excluded.last_banned_at,
    expires_at = excluded.expires_at
