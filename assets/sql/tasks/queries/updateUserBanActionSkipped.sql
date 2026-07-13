UPDATE user_ban_actions
SET status = 'skipped',
    reason = ?,
    changed = 0,
    completed_at = ?,
    error_message = NULL
WHERE id = ?
  AND status = 'pending'
