SELECT key_id, scope
FROM api_key_scopes
WHERE key_id = ?
ORDER BY scope ASC;
