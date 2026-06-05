INSERT INTO oauth_client_scope_requests (
    client_id,
    scope,
    review_status,
    reviewed_by,
    reviewed_at
)
VALUES (?, ?, ?, ?, ?);
