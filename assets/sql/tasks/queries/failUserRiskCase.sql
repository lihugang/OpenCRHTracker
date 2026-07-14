UPDATE user_risk_cases
SET status = 'failed',
    updated_at = ?,
    error_message = ?
WHERE id = ?
  AND status IN ('pending', 'escalating')
