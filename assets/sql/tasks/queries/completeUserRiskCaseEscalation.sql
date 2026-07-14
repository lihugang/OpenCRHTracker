UPDATE user_risk_cases
SET status = 'escalated',
    updated_at = ?,
    escalated_at = ?,
    error_message = NULL
WHERE id = ?
  AND status IN ('escalating', 'failed')
