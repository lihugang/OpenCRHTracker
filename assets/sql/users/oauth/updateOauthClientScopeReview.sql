UPDATE oauth_client_scope_requests
SET review_status = ?, reviewed_by = ?, reviewed_at = ?
WHERE client_id = ? AND scope = ?;
