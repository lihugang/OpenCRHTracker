UPDATE user_risk_cases
SET status = 'cleared',
    updated_at = ?,
    cleared_at = ?,
    cleared_by = ?,
    error_message = NULL
WHERE id = ?
  AND status IN ('pending', 'active', 'escalating', 'escalated', 'failed')
