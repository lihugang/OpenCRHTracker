SELECT DISTINCT
    fingerprint.id,
    fingerprint.ip_address,
    fingerprint.user_agent,
    fingerprint.first_action_id,
    fingerprint.latest_action_id,
    fingerprint.last_banned_at,
    fingerprint.expires_at
FROM user_ban_fingerprints AS fingerprint
INNER JOIN user_ban_actions AS action
    ON action.ip_address = fingerprint.ip_address
   AND action.user_agent = fingerprint.user_agent
WHERE action.user_id = ?
  AND action.action = 'ban'
  AND action.status = 'succeeded'
  AND action.source IN ('qq_ban_list', 'fingerprint_match')
  AND fingerprint.expires_at > ?
ORDER BY fingerprint.expires_at DESC, fingerprint.id DESC
