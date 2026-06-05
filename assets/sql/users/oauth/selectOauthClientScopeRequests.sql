SELECT client_id, scope, review_status, reviewed_by, reviewed_at
FROM oauth_client_scope_requests
WHERE client_id = ?
ORDER BY scope ASC;
