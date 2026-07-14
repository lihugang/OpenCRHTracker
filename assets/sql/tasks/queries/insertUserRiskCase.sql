INSERT INTO user_risk_cases (
    user_id,
    status,
    fingerprint_id,
    matched_action_id,
    ip_address,
    user_agent,
    qq_number,
    ban_action_id,
    detected_at,
    updated_at,
    escalated_at,
    cleared_at,
    cleared_by,
    error_message
) VALUES (?, 'pending', ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL)
