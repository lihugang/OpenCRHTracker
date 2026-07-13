SELECT
    id,
    ip_address,
    user_agent,
    first_action_id,
    latest_action_id,
    last_banned_at,
    expires_at
FROM user_ban_fingerprints
WHERE ip_address = ?
  AND user_agent = ?
