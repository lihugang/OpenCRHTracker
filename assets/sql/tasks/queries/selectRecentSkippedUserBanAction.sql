SELECT id
FROM user_ban_actions
WHERE user_id = ?
  AND action = 'ban'
  AND status = 'skipped'
  AND source = ?
  AND COALESCE(qq_number, '') = COALESCE(?, '')
  AND COALESCE(ip_address, '') = COALESCE(?, '')
  AND COALESCE(user_agent, '') = COALESCE(?, '')
  AND requested_at >= ?
ORDER BY requested_at DESC, id DESC
LIMIT 1
